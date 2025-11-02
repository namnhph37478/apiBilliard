// middlewares/error.middleware.js
const multer = require('multer');

const isProd = process.env.NODE_ENV === 'production';

/** Xác định request là API hay Web */
function isApiRequest(req) {
  const url = req.originalUrl || req.url || '';
  if (url.startsWith('/api')) return true;
  const accept = String(req.headers.accept || '').toLowerCase();
  if (accept.includes('application/json')) return true;
  const xr = String(req.headers['x-requested-with'] || '').toLowerCase();
  if (xr === 'xmlhttprequest') return true;
  return false;
}

/** Chuẩn hoá lỗi validate của Joi/Zod/Mongoose thành mảng {path,message} */
function normalizeValidationErrors(err) {
  // Joi
  if (err?.isJoi && Array.isArray(err.details)) {
    return err.details.map(d => ({
      path: Array.isArray(d.path) ? d.path.join('.') : String(d.path || ''),
      message: d.message.replace(/["]/g, ''),
    }));
  }
  // Zod
  if (err?.errors && Array.isArray(err.errors)) {
    return err.errors.map(e => ({
      path: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message,
    }));
  }
  // Mongoose ValidationError
  if (err?.name === 'ValidationError' && err?.errors) {
    return Object.values(err.errors).map(e => ({
      path: e.path || e.properties?.path || '',
      message: e.message || e.properties?.message || 'Invalid value',
    }));
  }
  return [];
}

/** Map các lỗi phổ biến sang status & message thân thiện */
function mapError(err) {
  // Mặc định
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || err.name || undefined;
  let errors = [];

  // Body parser JSON
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON payload';
    code = 'INVALID_JSON';
  }

  // Multer
  if (err instanceof multer.MulterError) {
    status = 400;
    code = `MULTER_${err.code}`;
    const map = {
      LIMIT_FILE_SIZE: 'File quá lớn',
      LIMIT_FILE_COUNT: 'Quá nhiều file',
      LIMIT_UNEXPECTED_FILE: 'Loại file không hợp lệ',
    };
    message = map[err.code] || 'Upload error';
  }

  // Joi/Zod/Mongoose validation
  if (err.isJoi || err?.errors || err?.name === 'ValidationError') {
    errors = normalizeValidationErrors(err);
    status = err.status || 422;
    message = err.message && !err.isJoi ? err.message : 'Validation failed';
    code = code || 'VALIDATION_ERROR';
  }

  // Mongoose CastError (sai ObjectId)
  if (err?.name === 'CastError') {
    status = 400;
    code = 'CAST_ERROR';
    message = `Invalid ${err.path || 'id'}: ${err.value}`;
  }

  // Mongo duplicate key
  if (err?.code === 11000) {
    status = 409;
    code = 'DUPLICATE_KEY';
    const fields = Object.keys(err.keyValue || {});
    message = fields.length
      ? `Duplicate value for: ${fields.join(', ')}`
      : 'Duplicate key';
    errors = fields.map(f => ({ path: f, message: 'Duplicate' }));
  }

  // JWT / Unauthorized (từ một số lib)
  if (err?.name === 'UnauthorizedError') {
    status = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or expired token';
  }

  // Mặc định không để 5xx lộ message hệ thống ở production
  if (status >= 500 && isProd) {
    message = 'Internal Server Error';
  }

  return { status, message, code, errors };
}

/**
 * Error handler chính.
 * - API → JSON
 * - Web → render view 'error'
 */
function errorHandler(err, req, res, _next) {
  const api = isApiRequest(req);
  const { status, message, code, errors } = mapError(err);

  if (api) {
    const payload = {
      status,
      message,
      ...(code && { code }),
      ...(errors && errors.length ? { errors } : {}),
      ...(!isProd ? { stack: err.stack } : {}),
    };
    return res.status(status).json(payload);
  }

  // Web: render hbs/ejs
  res.locals.message = message;
  res.locals.error = isProd ? {} : err;
  res.status(status);
  try {
    return res.render('error'); // giữ nguyên theo app generator
  } catch {
    // fallback nếu chưa cấu hình view
    return res.send(`<h1>${status}</h1><p>${message}</p>${!isProd ? `<pre>${err.stack}</pre>` : ''}`);
  }
}

module.exports = {
  errorHandler,
};
