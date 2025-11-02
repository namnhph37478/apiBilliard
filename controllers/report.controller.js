// controllers/report.controller.js
const R = require('../utils/response');
const { ensureRange, startOfDay, endOfDay } = require('../utils/time');

const Bill = require('../models/bill.model');
const Table = require('../models/table.model');
const Session = require('../models/session.model');
const Promotion = require('../models/promotion.model');

function safeRequire(p) {
  try { return require(p); } catch { return null; }
}
const ReportSvc = safeRequire('../services/report.service');

// ---------------------- helpers ----------------------
function parseBool(v, def = true) {
  if (typeof v === 'boolean') return v;
  if (v == null) return def;
  const s = String(v).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return def;
}
function toInt(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function matchBills({ from, to, branchId, paidOnly = true }) {
  const q = {};
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);
  }
  if (branchId) q.branchId = branchId;
  if (paidOnly) q.paid = true;
  return q;
}

// Fallback: tổng hợp số liệu bill nhanh gọn
async function aggSummary({ from, to, branchId, paidOnly = true }) {
  const $match = matchBills({ from, to, branchId, paidOnly });
  const [row] = await Bill.aggregate([
    { $match },
    {
      $group: {
        _id: null,
        bills: { $sum: 1 },
        billsPaid: { $sum: { $cond: ['$paid', 1, 0] } },
        total: { $sum: '$total' },
        subtotal: { $sum: '$subtotal' },
        playAmount: { $sum: '$playAmount' },
        serviceAmount: { $sum: '$serviceAmount' },
        discountTotal: { $sum: '$discountTotal' },
        surcharge: { $sum: '$surcharge' },
        byCash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
        byCard: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$total', 0] } },
        byTransfer: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'transfer'] }, '$total', 0] } },
        byOther: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'other'] }, '$total', 0] } },
      },
    },
  ]);
  const x = row || {};
  const avgTicket = x.billsPaid ? x.total / x.billsPaid : 0;
  return {
    bills: x.bills || 0,
    billsPaid: x.billsPaid || 0,
    total: x.total || 0,
    subtotal: x.subtotal || 0,
    playAmount: x.playAmount || 0,
    serviceAmount: x.serviceAmount || 0,
    discountTotal: x.discountTotal || 0,
    surcharge: x.surcharge || 0,
    avgTicket,
    byPayment: {
      cash: x.byCash || 0,
      card: x.byCard || 0,
      transfer: x.byTransfer || 0,
      other: x.byOther || 0,
    },
  };
}

// Fallback: chuỗi doanh thu theo groupBy (day|month)
async function aggRevenueSeries({ from, to, branchId, groupBy = 'day', paidOnly = true }) {
  const $match = matchBills({ from, to, branchId, paidOnly });
  const $project =
    groupBy === 'month'
      ? { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, total: 1 }
      : { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, d: { $dayOfMonth: '$createdAt' }, total: 1 };

  const $group =
    groupBy === 'month'
      ? { _id: { y: '$y', m: '$m' }, total: { $sum: '$total' }, count: { $sum: 1 } }
      : { _id: { y: '$y', m: '$m', d: '$d' }, total: { $sum: '$total' }, count: { $sum: 1 } };

  const rows = await Bill.aggregate([{ $match }, { $project }, { $group }, { $sort: { '_id.y': 1, '_id.m': 1, ...(groupBy === 'day' ? { '_id.d': 1 } : {}) } }]);

  return rows.map(r => ({
    date: groupBy === 'month'
      ? `${String(r._id.y).padStart(4, '0')}-${String(r._id.m).padStart(2, '0')}`
      : `${String(r._id.y).padStart(4, '0')}-${String(r._id.m).padStart(2, '0')}-${String(r._id.d).padStart(2, '0')}`,
    total: r.total,
    count: r.count,
  }));
}

// Fallback: top sản phẩm theo qty|amount
async function aggTopProducts({ from, to, branchId, limit = 10, metric = 'amount', paidOnly = true }) {
  const $match = matchBills({ from, to, branchId, paidOnly });
  const rows = await Bill.aggregate([
    { $match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        productName: { $last: '$items.productName' },
        qty: { $sum: '$items.qty' },
        amount: { $sum: '$items.amount' },
      },
    },
    { $sort: metric === 'qty' ? { qty: -1 } : { amount: -1 } },
    { $limit: limit },
  ]);
  return rows.map(x => ({ product: x._id, name: x.productName, qty: x.qty, amount: x.amount }));
}

// Fallback: top bàn theo minutes|amount (sử dụng hoá đơn)
async function aggTopTables({ from, to, branchId, limit = 10, metric = 'amount', paidOnly = true }) {
  const $match = matchBills({ from, to, branchId, paidOnly });
  const rows = await Bill.aggregate([
    { $match },
    {
      $group: {
        _id: '$table',
        tableName: { $last: '$tableName' },
        minutes: { $sum: '$playMinutes' },
        amount: { $sum: '$playAmount' },
        billCount: { $sum: 1 },
      },
    },
    { $sort: metric === 'minutes' ? { minutes: -1 } : { amount: -1 } },
    { $limit: limit },
  ]);
  return rows.map(x => ({ table: x._id, name: x.tableName, minutes: x.minutes, amount: x.amount, bills: x.billCount }));
}

// Fallback: theo nhân viên
async function aggByStaff({ from, to, branchId, paidOnly = true }) {
  const $match = matchBills({ from, to, branchId, paidOnly });
  const rows = await Bill.aggregate([
    { $match },
    {
      $group: {
        _id: '$staff',
        name: { $last: '$staffName' }, // nếu bạn có trường staffName snapshot, nếu không sẽ null
        bills: { $sum: 1 },
        total: { $sum: '$total' },
        playAmount: { $sum: '$playAmount' },
        serviceAmount: { $sum: '$serviceAmount' },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return rows.map(x => ({
    staff: x._id,
    name: x.name || null,
    bills: x.bills,
    total: x.total,
    playAmount: x.playAmount,
    serviceAmount: x.serviceAmount,
  }));
}

// ---------------------- controllers ----------------------

// GET /reports/summary?from&to&branchId&paidOnly=true
exports.summary = R.asyncHandler(async (req, res) => {
  const { from: qFrom, to: qTo, branchId } = req.query;
  const paidOnly = parseBool(req.query.paidOnly, true);
  const { from, to } = ensureRange({ from: qFrom, to: qTo });

  if (ReportSvc?.summary) {
    const data = await ReportSvc.summary({ from, to, branchId, paidOnly });
    return R.ok(res, data);
  }

  const data = await aggSummary({ from, to, branchId, paidOnly });
  return R.ok(res, data);
});

// GET /reports/daily?date=YYYY-MM-DD&branchId&paidOnly=true
exports.daily = R.asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const from = startOfDay(date);
  const to = endOfDay(date);
  const branchId = req.query.branchId || null;
  const paidOnly = parseBool(req.query.paidOnly, true);

  if (ReportSvc?.daily) {
    const data = await ReportSvc.daily({ date, branchId, paidOnly });
    return R.ok(res, data);
  }

  const data = await aggSummary({ from, to, branchId, paidOnly });
  return R.ok(res, { date, ...data });
});

// GET /reports/revenue?from&to&groupBy=day|month&branchId&paidOnly=true
exports.revenue = R.asyncHandler(async (req, res) => {
  const { from: qFrom, to: qTo, branchId } = req.query;
  const { from, to } = ensureRange({ from: qFrom, to: qTo });
  const groupBy = ['day', 'month'].includes(String(req.query.groupBy)) ? String(req.query.groupBy) : 'day';
  const paidOnly = parseBool(req.query.paidOnly, true);

  if (ReportSvc?.revenueSeries) {
    const series = await ReportSvc.revenueSeries({ from, to, branchId, groupBy, paidOnly });
    return R.ok(res, { groupBy, series });
  }

  const series = await aggRevenueSeries({ from, to, branchId, groupBy, paidOnly });
  return R.ok(res, { groupBy, series });
});

// GET /reports/top-products?from&to&limit=10&metric=qty|amount&branchId&paidOnly=true
exports.topProducts = R.asyncHandler(async (req, res) => {
  const { from: qFrom, to: qTo, branchId } = req.query;
  const { from, to } = ensureRange({ from: qFrom, to: qTo });
  const metric = ['qty', 'amount'].includes(String(req.query.metric)) ? String(req.query.metric) : 'amount';
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 10)));
  const paidOnly = parseBool(req.query.paidOnly, true);

  if (ReportSvc?.topProducts) {
    const items = await ReportSvc.topProducts({ from, to, branchId, limit, metric, paidOnly });
    return R.ok(res, { metric, items });
  }

  const items = await aggTopProducts({ from, to, branchId, limit, metric, paidOnly });
  return R.ok(res, { metric, items });
});

// GET /reports/top-tables?from&to&limit=10&metric=minutes|amount&branchId&paidOnly=true
exports.topTables = R.asyncHandler(async (req, res) => {
  const { from: qFrom, to: qTo, branchId } = req.query;
  const { from, to } = ensureRange({ from: qFrom, to: qTo });
  const metric = ['minutes', 'amount'].includes(String(req.query.metric)) ? String(req.query.metric) : 'amount';
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 10)));
  const paidOnly = parseBool(req.query.paidOnly, true);

  if (ReportSvc?.topTables) {
    const items = await ReportSvc.topTables({ from, to, branchId, limit, metric, paidOnly });
    return R.ok(res, { metric, items });
  }

  const items = await aggTopTables({ from, to, branchId, limit, metric, paidOnly });
  return R.ok(res, { metric, items });
});

// GET /reports/staff?from&to&branchId&paidOnly=true
exports.byStaff = R.asyncHandler(async (req, res) => {
  const { from: qFrom, to: qTo, branchId } = req.query;
  const { from, to } = ensureRange({ from: qFrom, to: qTo });
  const paidOnly = parseBool(req.query.paidOnly, true);

  if (ReportSvc?.byStaff) {
    const items = await ReportSvc.byStaff({ from, to, branchId, paidOnly });
    return R.ok(res, { items });
  }

  const items = await aggByStaff({ from, to, branchId, paidOnly });
  return R.ok(res, { items });
});

// GET /reports/dashboard?branchId
// Snapshot nhanh cho trang Dashboard: stats hôm nay + đếm trạng thái bàn + phiên mở + KM hiệu lực
exports.dashboard = R.asyncHandler(async (req, res) => {
  const branchId = req.query.branchId || null;
  const todayFrom = startOfDay(new Date());
  const todayTo = endOfDay(new Date());

  // Summary hôm nay
  const statsToday = ReportSvc?.summary
    ? await ReportSvc.summary({ from: todayFrom, to: todayTo, branchId, paidOnly: true })
    : await aggSummary({ from: todayFrom, to: todayTo, branchId, paidOnly: true });

  // Đếm trạng thái bàn
  const qTable = branchId ? { branchId } : {};
  const [tablesAll, sessionsOpen] = await Promise.all([
    Table.find(qTable).select('_id status').lean(),
    Session.find({ status: 'open', ...(branchId ? { branchId } : {}) })
      .select('_id table startTime items')
      .populate('table', 'name')
      .lean(),
  ]);

  const counts = {
    total: tablesAll.length,
    available: tablesAll.filter(t => t.status === 'available').length,
    playing: tablesAll.filter(t => t.status === 'playing').length,
    reserved: tablesAll.filter(t => t.status === 'reserved').length,
    maintenance: tablesAll.filter(t => t.status === 'maintenance').length,
  };

  // Top 5 hoá đơn gần đây (hôm nay)
  const billsRecent = await Bill.find({
    ...(branchId ? { branchId } : {}),
    createdAt: { $gte: todayFrom, $lte: todayTo },
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('_id code total paid createdAt tableName staffName')
    .lean();

  // KM đang hiệu lực (đơn giản: lấy active=true; nếu scope='time' áp rule thời gian)
  const promosAll = await Promotion.find({ active: true, ...(branchId ? { branchId } : {}) })
    .sort({ applyOrder: 1 })
    .select('name scope description timeRule')
    .lean();

  // Trả về
  return R.ok(res, {
    today: { from: todayFrom, to: todayTo },
    stats: { today: statsToday },
    counts: { tables: counts },
    sessionsOpen,
    billsRecent,
    promotionsActive: promosAll, // (có thể lọc thêm theo rule thời gian ở client hay service)
  });
});
