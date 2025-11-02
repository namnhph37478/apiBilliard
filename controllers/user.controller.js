// controllers/user.controller.js
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const R = require('../utils/response');

/** -------------------- helpers -------------------- */
function sanitize(u) {
  if (!u) return u;
  const doc = u.toJSON ? u.toJSON() : { ...u };
  delete doc.passwordHash;
  delete doc.password;
  delete doc.salt;
  return doc;
}

function parseSort(sortStr = '-createdAt') {
  if (!sortStr || typeof sortStr !== 'string') return { createdAt: -1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({ q, role, active, branchId }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ name: rx }, { username: rx }, { email: rx }, { phone: rx }];
  }
  if (role) query.role = role;
  if (typeof active === 'boolean' || active === 'true' || active === 'false') {
    query.active = String(active) === 'true' || active === true;
  }
  if (branchId) query.branchId = branchId;
  return query;
}

async function setPassword(user, plain) {
  if (!plain && User.schema.path('password')) {
    // schema yêu cầu password → thiếu thì ném lỗi 422
    const err = new Error('password là bắt buộc');
    err._status = 422;
    throw err;
  }
  if (typeof user.setPassword === 'function') {
    await user.setPassword(plain);
    return;
  }
  if (plain) {
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(String(plain), salt);
    // nếu schema có field "password" (thường để required), gán plaintext để pass validate
    if (User.schema.path('password')) {
      user.password = String(plain);
    }
  }
}

/** -------------------- controllers -------------------- */

// GET /users
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q,
    role,
    active,
    branchId,
    sort = '-createdAt',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = buildQuery({ q, role, active, branchId });
  const sortObj = parseSort(String(sort));

  const [itemsRaw, total] = await Promise.all([
    User.find(query).sort(sortObj).skip(skip).limit(limitNum),
    User.countDocuments(query),
  ]);

  const items = itemsRaw.map(sanitize);
  return R.paged(res, { items, page: pageNum, limit: limitNum, total, sort });
});

// GET /users/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const doc = await User.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'User not found');
  return R.ok(res, sanitize(doc));
});

// POST /users  (admin tạo nhân viên)
exports.create = R.asyncHandler(async (req, res) => {
  let {
    username,
    password,
    name,
    email,
    phone,
    avatar,
    role = 'staff',
    active = true,
    branchId = null,
  } = req.body;

  const uname = String(username || '').trim().toLowerCase();
  if (!uname) return R.fail(res, 422, 'username là bắt buộc');
  if (!password && User.schema.path('password'))
    return R.fail(res, 422, 'password là bắt buộc');

  // kiểm tra trùng username
  const existed = await User.findOne({ username: uname });
  if (existed) return R.fail(res, 409, 'Username đã tồn tại');

  const user = new User({
    username: uname,
    name,
    email,
    phone,
    avatar,
    role,
    active,
    branchId: branchId || null,
  });

  try {
    await setPassword(user, password);
  } catch (e) {
    return R.fail(res, e._status || 400, e.message || 'Mật khẩu không hợp lệ');
  }

  await user.save();
  return R.created(res, sanitize(user), 'User created');
});

// PUT /users/:id
exports.update = R.asyncHandler(async (req, res) => {
  const { name, email, phone, avatar, role, active, branchId } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) return R.fail(res, 404, 'User not found');

  if (typeof name !== 'undefined') user.name = name;
  if (typeof email !== 'undefined') user.email = email;
  if (typeof phone !== 'undefined') user.phone = phone;
  if (typeof avatar !== 'undefined') user.avatar = avatar;
  if (typeof role !== 'undefined') user.role = role;
  if (typeof active !== 'undefined') user.active = active;
  if (typeof branchId !== 'undefined') user.branchId = branchId;

  await user.save();
  return R.ok(res, sanitize(user), 'User updated');
});

// PATCH /users/:id/role
exports.changeRole = R.asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return R.fail(res, 404, 'User not found');
  user.role = req.body.role;
  await user.save();
  return R.ok(res, sanitize(user), 'Role updated');
});

// PATCH /users/:id/active
exports.setActive = R.asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return R.fail(res, 404, 'User not found');
  user.active = req.body.active === true || req.body.active === 'true';
  await user.save();
  return R.ok(res, sanitize(user), 'Active state updated');
});

// PATCH /users/:id/reset-password
exports.resetPassword = R.asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return R.fail(res, 422, 'newPassword là bắt buộc');

  const user = await User.findById(req.params.id);
  if (!user) return R.fail(res, 404, 'User not found');

  await setPassword(user, newPassword);
  await user.save();

  return R.ok(res, null, 'Password reset successfully');
});

// DELETE /users/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const doc = await User.findByIdAndDelete(req.params.id);
  if (!doc) return R.fail(res, 404, 'User not found');
  return R.noContent(res);
});
