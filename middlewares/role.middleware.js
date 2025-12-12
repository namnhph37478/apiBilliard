// middlewares/role.middleware.js
const { ROLES } = require('../models/user.model');

// ---- helpers ----
function deny(res, code = 403, message = 'Forbidden') {
  return res.status(code).json({ status: code, message });
}
function hasRole(user, allowed) {
  if (!user) return false;
  const set = new Set([].concat(allowed || []).filter(Boolean));
  // Nếu không truyền danh sách -> coi như pass
  if (set.size === 0) return true;
  return set.has(user.role);
}

// ---- middlewares ----

/**
 * requireRole(['admin']) hoặc requireRole('staff')
 * YÊU CẦU đã chạy requireAuth trước để có req.user.
 */
function requireRole(allowed) {
  return (req, res, next) => {
    if (!req.user) return deny(res, 401, 'Unauthorized');
    const ok = hasRole(req.user, allowed);

    if (!ok) return deny(res);
    return next();
  };
}

/** alias cho requireRole (dễ đọc) */
function requireAnyRole(roles) {
  return requireRole(roles);
}

/**
 * Cho phép nếu:
 *  - req.params[param] (hoặc body/query) === chính user hiện tại
 *  - HOẶC user có 1 trong các role cho phép (mặc định ['admin'])
 * Ví dụ: chỉnh sửa thông tin user theo id, nhưng admin có thể sửa bất kỳ.
 */
function requireSelfOrRole(options = {}) {
  const { param = 'id', roles = ['admin'] } = options;

  return (req, res, next) => {
    if (!req.user) return deny(res, 401, 'Unauthorized');

    const currentId = String(req.user._id || req.user.id || '');
    const targetId =
      (req.params && req.params[param]) ||
      (req.body && req.body[param]) ||
      (req.query && req.query[param]) || null;

    if (targetId && String(targetId) === currentId) return next();
    if (hasRole(req.user, roles)) return next();

    return deny(res);
  };
}

/** Tiện dụng: chỉ admin */
function requireAdmin(req, res, next) {
  return requireRole(['admin'])(req, res, next);
}

module.exports = {
  requireRole,
  requireAnyRole,
  requireSelfOrRole,
  requireAdmin,
  ROLES, // export luôn cho tiện dùng nơi khác nếu cần
};
