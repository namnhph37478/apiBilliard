// middlewares/notfound.middleware.js
const createError = require('http-errors');

/**
 * 404 JSON dành cho API (không đẩy qua error handler)
 * Dùng sau cùng cho prefix /api hoặc /api/v1
 */
function apiNotFound(req, res, _next) {
  const status = 404;
  return res.status(status).json({
    status,
    message: 'Not Found',
    method: req.method,
    path: req.originalUrl || req.url,
  });
}

/**
 * 404 cho trang web (đẩy vào error handler để render hbs/ejs...)
 */
function webNotFound(_req, _res, next) {
  return next(createError(404, 'Not Found'));
}

/**
 * Tự động: nếu đường dẫn bắt đầu bằng /api → JSON, ngược lại → render
 * Tiện dùng nếu bạn không muốn tách mount cho API/Web.
 */
function autoNotFound(req, res, next) {
  const url = req.originalUrl || req.url || '';
  if (url.startsWith('/api')) return apiNotFound(req, res, next);
  return webNotFound(req, res, next);
}

module.exports = {
  apiNotFound,
  webNotFound,
  autoNotFound,
};
