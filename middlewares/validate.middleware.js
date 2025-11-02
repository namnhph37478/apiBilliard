// middlewares/validate.middleware.js
const Joi = require('joi');

/** ---- Utils ---- */
const isZod = (schema) => schema && typeof schema.safeParse === 'function';
const isJoi = (schema) => schema && typeof schema.validate === 'function';

/** Chuẩn hoá lỗi từ Joi/Zod → [{ path, message }] */
function normalizeErrors(err) {
  if (!err) return [];
  // Joi
  if (err.isJoi && Array.isArray(err.details)) {
    return err.details.map(d => ({
      path: Array.isArray(d.path) ? d.path.join('.') : String(d.path || ''),
      message: d.message.replace(/["]/g, ''),
    }));
  }
  // Zod
  if (Array.isArray(err.errors)) {
    return err.errors.map(e => ({
      path: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message,
    }));
  }
  // Fallback
  return [{ path: '', message: err.message || 'Validation error' }];
}

/** Validate từng phần request với Joi/Zod */
async function validatePart(schema, data, options) {
  if (!schema) return { value: data, errors: [] };

  // Zod
  if (isZod(schema)) {
    const parsed = schema.safeParse(data);
    if (parsed.success) return { value: parsed.data, errors: [] };
    return { value: data, errors: normalizeErrors(parsed.error) };
  }

  // Joi
  if (isJoi(schema)) {
    try {
      const value = await schema.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
        ...options?.joi,
      });
      return { value, errors: [] };
    } catch (e) {
      return { value: data, errors: normalizeErrors(e) };
    }
  }

  // Không hỗ trợ kiểu schema khác
  return { value: data, errors: [{ path: '', message: 'Unsupported schema type' }] };
}

/**
 * validate({ body, query, params, headers }, options?)
 * - Tự động áp dụng cho từng phần; nếu có lỗi → 400 { status, message, errors }
 * - Nếu pass → gán giá trị đã sanitize lại vào req.*
 */
function validate(schemas = {}, options = {}) {
  const parts = ['params', 'query', 'body', 'headers'];

  return async function (req, res, next) {
    try {
      const allErrors = [];

      for (const part of parts) {
        if (!schemas[part]) continue;
        const src = part === 'headers' ? req.headers : req[part];
        const { value, errors } = await validatePart(schemas[part], src, options);
        if (errors.length) {
          allErrors.push(...errors.map(e => ({ ...e, in: part })));
        } else {
          if (part === 'headers') {
            // headers nên hạn chế mutate; bỏ qua gán lại
          } else {
            req[part] = value;
          }
        }
      }

      if (allErrors.length) {
        const status = Number(options.statusCode || 400);
        return res.status(status).json({
          status,
          message: 'Validation failed',
          errors: allErrors,
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** --------- Joi helpers tiện dụng --------- */

/** Joi ObjectId: chuỗi 24 hex hợp lệ */
const JoiObjectId = () =>
  Joi.string().trim().length(24).hex()
    .messages({
      'string.length': 'Invalid ObjectId length',
      'string.hex': 'Invalid ObjectId',
    });

/** Middleware nhanh để check params.id là ObjectId */
function requireObjectIdParam(param = 'id') {
  return validate({
    params: Joi.object({ [param]: JoiObjectId().required() }),
  });
}

module.exports = {
  validate,
  Joi,           // re-export để dùng đồng bộ trong validators/*
  JoiObjectId,   // helper
  requireObjectIdParam,
};
