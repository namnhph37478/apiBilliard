// controllers/setting.controller.js
const R = require('../utils/response');
const Setting = require('../models/setting.model');

function safeRequire(p) { try { return require(p); } catch { return null; } }
const Billing = safeRequire('../services/billing.service'); // để dùng getActiveSetting nếu có
const getActiveSetting = Billing?.getActiveSetting;

/* =============== Helpers =============== */
function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

function pickScope(req) {
  // Ưu tiên query, rồi đến body, mặc định 'global'
  const scope = String(req.query.scope || req.body.scope || 'global').toLowerCase();
  const branchId = req.query.branchId || req.body.branchId || null;
  return { scope, branchId };
}

async function findSetting(scope = 'global', branchId = null) {
  const q = scope === 'branch' ? { scope: 'branch', branchId } : { scope: 'global' };
  return Setting.findOne(q);
}

async function ensureSetting(scope = 'global', branchId = null, { createdBy, updatedBy } = {}) {
  const existed = await findSetting(scope, branchId);
  if (existed) return existed;
  const payload = {
    scope: scope === 'branch' ? 'branch' : 'global',
    branchId: scope === 'branch' ? (branchId || null) : null,
    createdBy: createdBy || null,
    updatedBy: updatedBy || null,
  };
  return Setting.create(payload);
}

/* =============== Controllers =============== */

// GET /settings (lấy theo scope cụ thể)
// query: scope=global|branch & branchId=... (nếu scope=branch)
exports.getCurrent = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);

  if (scope === 'branch' && !branchId) {
    return R.fail(res, 400, 'branchId is required for scope=branch');
  }

  const doc = await findSetting(scope, branchId);
  // Không tự tạo ở GET — trả null nếu chưa cấu hình
  return R.ok(res, doc ? sanitize(doc) : null);
});

// GET /settings/effective?branchId=...  (trả cấu hình áp dụng thực tế: nhánh nếu có, không thì global)
exports.getEffective = R.asyncHandler(async (req, res) => {
  const branchId = req.query.branchId || null;

  if (typeof getActiveSetting === 'function') {
    const cfg = await getActiveSetting(branchId);
    return R.ok(res, cfg || null);
  }

  // Fallback: lấy branch trước, nếu không có thì global
  let doc = null;
  if (branchId) doc = await Setting.findOne({ scope: 'branch', branchId });
  if (!doc) doc = await Setting.findOne({ scope: 'global' });

  return R.ok(res, doc ? sanitize(doc) : null);
});

// PUT /settings  (upsert toàn bộ theo scope)
// body: { scope, branchId?, shop, billing, print, eReceipt, backup }
exports.upsert = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) {
    return R.fail(res, 400, 'branchId is required for scope=branch');
  }

  const createdBy = req.user?._id || null;
  const doc = await ensureSetting(scope, branchId, { createdBy, updatedBy: createdBy });

  // Ghi đè toàn bộ từng nhóm cấu hình
  const { shop, billing, print, eReceipt, backup } = req.body;
  if (typeof shop !== 'undefined') doc.shop = shop;
  if (typeof billing !== 'undefined') doc.billing = billing;
  if (typeof print !== 'undefined') doc.print = print;
  if (typeof eReceipt !== 'undefined') doc.eReceipt = eReceipt;
  if (typeof backup !== 'undefined') doc.backup = backup;

  doc.updatedBy = req.user?._id || null;
  await doc.save();

  return R.ok(res, sanitize(doc), 'Settings upserted');
});

// PATCH /settings/shop[?scope=...&branchId=...]
exports.setShop = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required');
  const doc = await ensureSetting(scope, branchId, { createdBy: req.user?._id, updatedBy: req.user?._id });

  doc.shop = req.body;
  doc.updatedBy = req.user?._id || null;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Shop settings updated');
});

// PATCH /settings/billing[?scope=...&branchId=...]
exports.setBilling = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required');
  const doc = await ensureSetting(scope, branchId, { createdBy: req.user?._id, updatedBy: req.user?._id });

  doc.billing = req.body;
  doc.updatedBy = req.user?._id || null;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Billing settings updated');
});

// PATCH /settings/print[?scope=...&branchId=...]
exports.setPrint = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required');
  const doc = await ensureSetting(scope, branchId, { createdBy: req.user?._id, updatedBy: req.user?._id });

  doc.print = req.body;
  doc.updatedBy = req.user?._id || null;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Print settings updated');
});

// PATCH /settings/e-receipt[?scope=...&branchId=...]
exports.setEReceipt = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required');
  const doc = await ensureSetting(scope, branchId, { createdBy: req.user?._id, updatedBy: req.user?._id });

  doc.eReceipt = req.body;
  doc.updatedBy = req.user?._id || null;
  await doc.save();
  return R.ok(res, sanitize(doc), 'E-receipt settings updated');
});

// PATCH /settings/backup[?scope=...&branchId=...]
exports.setBackup = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required');
  const doc = await ensureSetting(scope, branchId, { createdBy: req.user?._id, updatedBy: req.user?._id });

  doc.backup = req.body;
  doc.updatedBy = req.user?._id || null;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Backup settings updated');
});

/* =============== (tuỳ chọn) Admin utilities =============== */

// GET /settings/all  — danh sách toàn bộ bản ghi cấu hình (admin)
exports.listAll = R.asyncHandler(async (_req, res) => {
  const items = await Setting.find().sort({ scope: 1, branchId: 1, updatedAt: -1 });
  return R.ok(res, items.map(sanitize));
});

// GET /settings/:id
exports.getById = R.asyncHandler(async (req, res) => {
  const doc = await Setting.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Setting not found');
  return R.ok(res, sanitize(doc));
});

// DELETE /settings/:id  — xoá bản ghi cấu hình (không bắt buộc)
exports.remove = R.asyncHandler(async (req, res) => {
  const doc = await Setting.findByIdAndDelete(req.params.id);
  if (!doc) return R.fail(res, 404, 'Setting not found');
  return R.noContent(res);
});
