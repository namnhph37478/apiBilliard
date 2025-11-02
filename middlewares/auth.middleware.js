// middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '1h';
const REFRESH_EXPIRES = process.env.REFRESH_EXPIRES || '7d';

// -------- Helpers --------
function getTokenFromReq(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (h && typeof h === 'string' && h.startsWith('Bearer ')) {
    return h.slice(7).trim();
  }
  // fallback cookie
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;
  return null;
}

function error401(res, message = 'Unauthorized') {
  return res.status(401).json({ status: 401, message });
}

async function findActiveUser(id) {
  if (!id) return null;
  const user = await User.findById(id).select('_id username name role active avatar');
  if (!user || !user.active) return null;
  return user;
}

// -------- Token sign utils (dùng trong auth.routes.js) --------
function signAccessToken(user, extra = {}) {
  const payload = { id: String(user._id), role: user.role, ...extra };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function signRefreshToken(user, extra = {}) {
  const payload = { id: String(user._id), type: 'refresh', ...extra };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_EXPIRES });
}

function issueTokens(user, extra = {}) {
  return {
    token: signAccessToken(user, extra),
    refreshToken: signRefreshToken(user, extra),
  };
}

// -------- Middlewares --------

/**
 * optionalAuth: nếu có token hợp lệ -> gắn req.auth & req.user; nếu không có/không hợp lệ -> bỏ qua, next()
 */
async function optionalAuth(req, _res, next) {
  const token = getTokenFromReq(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload; // { id, role, iat, exp, ... }
    const user = await findActiveUser(payload.id || payload._id);
    if (user) req.user = user;
  } catch (_e) {
    // bỏ qua lỗi để không chặn request public
  }
  return next();
}

/**
 * requireAuth: bắt buộc có token hợp lệ & user active
 */
async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return error401(res, 'Missing token');

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      if (e.name === 'TokenExpiredError') return error401(res, 'Token expired');
      return error401(res, 'Invalid token');
    }

    const user = await findActiveUser(payload.id || payload._id);
    if (!user) return error401(res, 'User not found or inactive');

    req.auth = payload;
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * verifyRefresh: dùng cho route /auth/refresh — chỉ chấp nhận token có payload.type === 'refresh'
 */
async function verifyRefresh(req, res, next) {
  const token = getTokenFromReq(req) || req.body?.refreshToken || req.query?.refreshToken;
  if (!token) return error401(res, 'Missing refresh token');

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'refresh') return error401(res, 'Invalid refresh token');

    const user = await findActiveUser(payload.id || payload._id);
    if (!user) return error401(res, 'User not found or inactive');

    req.auth = payload;
    req.user = user;
    return next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return error401(res, 'Refresh token expired');
    return error401(res, 'Invalid refresh token');
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
  verifyRefresh,
  // token helpers (để dùng ở controller/routes đăng nhập/refresh)
  signAccessToken,
  signRefreshToken,
  issueTokens,
};
