// utils/response.js
// Bộ helper chuẩn cho response + async handler

function ok(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ status, message, data });
}

function created(res, data = null, message = 'Created') {
  return res.status(201).json({ status: 201, message, data });
}

function noContent(res) {
  return res.status(204).end();
}

/**
 * Trả lỗi chuẩn hoá
 * @param {Response} res
 * @param {number} status 400/401/403/404/409/422/500...
 * @param {string} message
 * @param {object} extra  (vd: { errors: {...} } hoặc các field bổ sung)
 */
function fail(res, status = 400, message = 'Bad Request', extra = null) {
  const payload = { status, message };
  if (extra && typeof extra === 'object') {
    if (extra.errors) payload.errors = extra.errors;
    // gộp thêm các field khác nếu cần
    for (const k of Object.keys(extra)) {
      if (k !== 'errors') payload[k] = extra[k];
    }
  }
  return res.status(status).json(payload);
}

/**
 * Bao try/catch cho controller async
 * Usage: exports.list = asyncHandler(async (req, res) => { ... })
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Gói kết quả phân trang
 * @param {Response} res
 * @param {object} data { items, page, limit, total, sort, ...rest }
 * @param {string} message
 * @param {number} status
 */
function paged(
  res,
  { items = [], page = 1, limit = 20, total = 0, sort, ...rest },
  message = 'OK',
  status = 200
) {
  return res.status(status).json({
    status,
    message,
    data: { items, page, limit, total, sort, ...rest },
  });
}

module.exports = {
  ok,
  created,
  noContent,
  fail,
  paged,
  asyncHandler,
};
