// controllers/table-type.controller.js
const R = require('../utils/response');
const TableType = require('../models/table-type.model');
const Table = require('../models/table.model');
const { timeRangeOverlap } = require('../utils/time');

// ----------------- helpers -----------------
function parseSort(sortStr = 'name') {
  if (!sortStr || typeof sortStr !== 'string') return { name: 1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({ q, active, branchId }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ name: rx }, { code: rx }];
  }
  if (typeof active === 'boolean' || active === 'true' || active === 'false') {
    query.active = String(active) === 'true' || active === true;
  }
  if (branchId) query.branchId = branchId;
  return query;
}

/** Kiểm tra chồng lấn dayRates theo từng ngày trong tuần */
function validateDayRates(dayRates = []) {
  const errors = [];
  if (!Array.isArray(dayRates)) return errors;

  // Chuẩn hoá: nếu không có days -> coi như áp dụng mọi ngày (0..6)
  const lines = dayRates.map((r, idx) => ({
    idx,
    days: Array.isArray(r.days) && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6],
    from: r.from,
    to: r.to,
    ratePerHour: r.ratePerHour,
  }));

  // Với từng ngày, kiểm tra các cặp (i,j) có overlap
  for (let d = 0; d <= 6; d++) {
    const sameDay = lines.filter(l => l.days.includes(d));
    for (let i = 0; i < sameDay.length; i++) {
      for (let j = i + 1; j < sameDay.length; j++) {
        const A = sameDay[i], B = sameDay[j];
        if (!A.from || !A.to || !B.from || !B.to) continue; // bỏ qua nếu thiếu from/to
        if (timeRangeOverlap(A.from, A.to, B.from, B.to)) {
          errors.push({
            day: d,
            i: A.idx,
            j: B.idx,
            message: `dayRates dòng #${A.idx + 1} chồng lấn với dòng #${B.idx + 1} tại ngày ${d}`,
          });
        }
      }
    }
  }
  return errors;
}

function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

// ----------------- controllers -----------------

// GET /table-types
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    q,
    active,
    branchId,
    sort = 'name',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const query = buildQuery({ q, active, branchId });
  const sortObj = parseSort(String(sort));

  const [items, total] = await Promise.all([
    TableType.find(query).sort(sortObj).skip(skip).limit(limitNum),
    TableType.countDocuments(query),
  ]);

  return R.paged(res, {
    items: items.map(sanitize),
    page: pageNum,
    limit: limitNum,
    total,
    sort,
  });
});

// GET /table-types/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const id = req.params.id;
  const doc = await TableType.findById(id);
  if (!doc) return R.fail(res, 404, 'TableType not found');

  // thống kê số bàn đang dùng loại này
  const used = await Table.countDocuments({ type: doc._id });
  return R.ok(res, { ...sanitize(doc), tablesUsing: used });
});

// POST /table-types
exports.create = R.asyncHandler(async (req, res) => {
  const {
    code,
    name,
    baseRatePerHour,
    dayRates = [],
    active = true,
    branchId = null,
  } = req.body;

  // validate chồng lấn
  const overlaps = validateDayRates(dayRates);
  if (overlaps.length) {
    return R.fail(res, 422, 'dayRates bị chồng lấn', { errors: overlaps });
  }

  const doc = await TableType.create({
    code: String(code || '').trim().toUpperCase(),
    name: String(name || '').trim(),
    baseRatePerHour: Number(baseRatePerHour || 0),
    dayRates,
    active: !!active,
    branchId: branchId || null,
  });

  return R.created(res, sanitize(doc), 'TableType created');
});

// PUT /table-types/:id
exports.update = R.asyncHandler(async (req, res) => {
  const {
    code,
    name,
    baseRatePerHour,
    dayRates, // nếu gửi -> thay mới toàn bộ
    active,
    branchId,
  } = req.body;

  const doc = await TableType.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'TableType not found');

  if (typeof code !== 'undefined') doc.code = String(code).trim().toUpperCase();
  if (typeof name !== 'undefined') doc.name = name;
  if (typeof baseRatePerHour !== 'undefined') doc.baseRatePerHour = Number(baseRatePerHour);

  if (typeof dayRates !== 'undefined') {
    const overlaps = validateDayRates(dayRates || []);
    if (overlaps.length) {
      return R.fail(res, 422, 'dayRates bị chồng lấn', { errors: overlaps });
    }
    doc.dayRates = Array.isArray(dayRates) ? dayRates : [];
  }

  if (typeof active !== 'undefined') doc.active = !!active;
  if (typeof branchId !== 'undefined') doc.branchId = branchId;

  await doc.save();
  return R.ok(res, sanitize(doc), 'TableType updated');
});

// PATCH /table-types/:id/active
exports.setActive = R.asyncHandler(async (req, res) => {
  const doc = await TableType.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'TableType not found');

  doc.active = !!req.body.active;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Active state updated');
});

// PATCH /table-types/:id/day-rates  (thay toàn bộ khung giờ)
exports.setDayRates = R.asyncHandler(async (req, res) => {
  const doc = await TableType.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'TableType not found');

  const dayRates = Array.isArray(req.body.dayRates) ? req.body.dayRates : [];
  const overlaps = validateDayRates(dayRates);
  if (overlaps.length) {
    return R.fail(res, 422, 'dayRates bị chồng lấn', { errors: overlaps });
  }

  doc.dayRates = dayRates;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Day rates updated');
});

// DELETE /table-types/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const id = req.params.id;

  // chặn xoá nếu đang có bàn dùng loại này
  const inUse = await Table.exists({ type: id });
  if (inUse) return R.fail(res, 409, 'Không thể xoá: đang có bàn sử dụng loại này');

  const doc = await TableType.findByIdAndDelete(id);
  if (!doc) return R.fail(res, 404, 'TableType not found');

  return R.noContent(res);
});
