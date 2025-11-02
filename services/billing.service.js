// services/billing.service.js
const mongoose = require('mongoose');
const { withTransaction } = require('../config/db');

const Setting = require('../models/setting.model');
const Table = require('../models/table.model');
const TableType = require('../models/table-type.model');
const Session = require('../models/session.model');
const Product = require('../models/product.model');
const Bill = require('../models/bill.model');

// ======================= Time helpers =======================

function hhmmString(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function hhmmToMinutes(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
}
function inTimeRange(curHHMM, from, to) {
  // Hỗ trợ khoảng qua đêm: from > to (vd 22:00 → 03:00)
  const cur = hhmmToMinutes(curHHMM);
  const f = hhmmToMinutes(from);
  const t = hhmmToMinutes(to);
  if (Number.isNaN(f) || Number.isNaN(t)) return true; // nếu thiếu, coi như hợp lệ
  if (f <= t) return cur >= f && cur <= t;
  return cur >= f || cur <= t; // qua đêm
}

// ======================= Settings =======================

async function getActiveSetting(branchId, session = null) {
  const q = branchId
    ? { scope: 'branch', branchId }
    : { scope: 'global', branchId: null };

  const doc = await Setting.findOne(q).session(session);
  if (doc) return doc;

  // Fallback: global nếu không có bản ghi branch
  const global = await Setting.findOne({ scope: 'global', branchId: null }).session(session);
  if (global) return global;

  // Mặc định nếu chưa cấu hình
  return new Setting({
    scope: 'global',
    shop: { name: 'Billiard POS' },
    billing: { roundingStep: 5, roundingMode: 'ceil', graceMinutes: 0 },
    print: { paperSize: '80mm', showLogo: true, showQR: true, copies: 1 },
    eReceipt: { enabled: true, baseUrl: '' },
  });
}

// ======================= Pricing =======================

/**
 * Chọn đơn giá/h hợp lệ tại thời điểm 'at':
 * - Ưu tiên rate override ở Table.ratePerHour
 * - Nếu không, xét dayRates của TableType (đúng ngày + khung giờ)
 * - Nếu không, dùng baseRatePerHour
 * @returns { ratePerHour:number, source:'table'|'type' }
 */
function resolveRatePerHour(tableDoc, tableTypeDoc, at = new Date()) {
  if (typeof tableDoc?.ratePerHour === 'number' && tableDoc.ratePerHour >= 0) {
    return { ratePerHour: tableDoc.ratePerHour, source: 'table' };
  }
  const day = at.getDay(); // 0..6
  const cur = hhmmString(at);
  const rates = Array.isArray(tableTypeDoc?.dayRates) ? tableTypeDoc.dayRates : [];
  const matched = rates.find(r => {
    const okDay = Array.isArray(r.days) && r.days.length ? r.days.includes(day) : true;
    const okTime = r.from && r.to ? inTimeRange(cur, r.from, r.to) : true;
    return okDay && okTime;
  });
  if (matched) return { ratePerHour: Number(matched.ratePerHour || 0), source: 'type' };
  return { ratePerHour: Number(tableTypeDoc?.baseRatePerHour || 0), source: 'type' };
}

/**
 * Snapshot TableType & Rate tại thời điểm check-in
 */
function buildTableTypeSnapshot(tableDoc, tableTypeDoc, at = new Date()) {
  const { ratePerHour, source } = resolveRatePerHour(tableDoc, tableTypeDoc, at);
  return {
    typeId: tableTypeDoc._id,
    code: String(tableTypeDoc.code || '').toUpperCase(),
    name: tableTypeDoc.name,
    ratePerHour,
    rateSource: source, // 'table' | 'type'
  };
}

/**
 * Snapshot rule tính giờ (roundingStep/mode, grace)
 */
function buildBillingRuleSnapshot(settingDoc) {
  const step = Number(settingDoc?.billing?.roundingStep ?? 5);
  const mode = settingDoc?.billing?.roundingMode || 'ceil';
  const grace = Number(settingDoc?.billing?.graceMinutes ?? 0);
  return { roundingStep: step, graceMinutes: grace, roundingMode: mode };
}

// ======================= Minutes & amount =======================

/**
 * Tính phút chơi (raw & sau làm tròn) theo rule
 * @param {Date} start
 * @param {Date|null} end
 * @param {{roundingStep:number, roundingMode:'ceil'|'round'|'floor', graceMinutes:number}} rule
 */
function computeMinutes(start, end, rule) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : new Date();
  if (!s) return { rawMinutes: 0, billMinutes: 0 };

  const rawMinutes = Math.max(0, Math.ceil((e - s) / 60000)); // làm tròn lên 1 phút
  const step = Number(rule?.roundingStep || 1);
  const mode = String(rule?.roundingMode || 'ceil');
  const grace = Number(rule?.graceMinutes || 0);

  if (rawMinutes <= grace) return { rawMinutes, billMinutes: 0 };

  if (step <= 1) return { rawMinutes, billMinutes: rawMinutes };

  const unit = rawMinutes / step;
  let rd;
  if (mode === 'floor') rd = Math.floor(unit);
  else if (mode === 'round') rd = Math.round(unit);
  else rd = Math.ceil(unit);
  const billMinutes = rd * step;

  return { rawMinutes, billMinutes };
}

/**
 * Tính tiền giờ
 */
function computePlayAmount(ratePerHour, billMinutes) {
  const amount = (Number(ratePerHour || 0) / 60) * Number(billMinutes || 0);
  // tiền Việt thường làm tròn đồng
  return Math.max(0, Math.round(amount));
}

// ======================= Session lifecycle =======================

/**
 * Check-in: tạo Session + chuyển bàn sang 'playing'
 */
async function openSession({ tableId, staffId, startAt = new Date() }) {
  return withTransaction(async (tx) => {
    const [table, existing] = await Promise.all([
      Table.findById(tableId).populate('type').session(tx),
      Session.findOne({ table: tableId, status: 'open' }).session(tx),
    ]);
    if (!table) throw new Error('Table not found');
    if (!table.active) throw new Error('Table is inactive');
    if (existing) throw new Error('This table already has an open session');

    const setting = await getActiveSetting(table.branchId, tx);
    const tableType = table.type || await TableType.findById(table.type).session(tx);
    if (!tableType) throw new Error('TableType not found');

    const tableTypeSnapshot = buildTableTypeSnapshot(table, tableType, startAt);
    const billingRuleSnapshot = buildBillingRuleSnapshot(setting);

    const sessionDoc = await Session.create([{
      table: table._id,
      tableTypeSnapshot,
      billingRuleSnapshot,
      startTime: startAt,
      staffStart: staffId,
      items: [],
      status: 'open',
      branchId: table.branchId || null,
    }], { session: tx }).then(x => x[0]);

    // Cập nhật trạng thái bàn
    table.status = 'playing';
    await table.save({ session: tx });

    return sessionDoc;
  });
}

/**
 * Thêm sản phẩm vào phiên (nếu sản phẩm đã tồn tại -> cộng dồn)
 */
async function addItem({ sessionId, productId, qty = 1, note = '' }) {
  if (qty <= 0) throw new Error('Quantity must be > 0');

  const [sessionDoc, product] = await Promise.all([
    Session.findById(sessionId),
    Product.findById(productId),
  ]);
  if (!sessionDoc) throw new Error('Session not found');
  if (sessionDoc.status !== 'open') throw new Error('Session is not open');
  if (!product || !product.active) throw new Error('Product not found or inactive');

  // Tìm item cùng product để cộng dồn
  const existed = (sessionDoc.items || []).find(it => String(it.product) === String(product._id));
  if (existed) {
    existed.qty += qty;
    if (note) existed.note = note;
  } else {
    sessionDoc.items.push({
      product: product._id,
      nameSnapshot: product.name,
      priceSnapshot: product.price,
      qty,
      note,
    });
  }

  await sessionDoc.save();
  return sessionDoc;
}

/**
 * Cập nhật số lượng item (<=0 thì xoá)
 */
async function updateItemQty({ sessionId, itemId, qty }) {
  const sessionDoc = await Session.findById(sessionId);
  if (!sessionDoc) throw new Error('Session not found');
  if (sessionDoc.status !== 'open') throw new Error('Session is not open');

  const it = (sessionDoc.items || []).id(itemId);
  if (!it) throw new Error('Item not found');

  if (qty <= 0) {
    it.deleteOne();
  } else {
    it.qty = qty;
  }
  await sessionDoc.save();
  return sessionDoc;
}

/**
 * Xoá 1 item
 */
async function removeItem({ sessionId, itemId }) {
  const sessionDoc = await Session.findById(sessionId);
  if (!sessionDoc) throw new Error('Session not found');
  if (sessionDoc.status !== 'open') throw new Error('Session is not open');

  const it = (sessionDoc.items || []).id(itemId);
  if (!it) throw new Error('Item not found');
  it.deleteOne();

  await sessionDoc.save();
  return sessionDoc;
}

/**
 * Xem thử (preview) tiền giờ & tổng tạm tính tại thời điểm endAt (không lưu)
 */
async function previewClose({ sessionId, endAt = new Date() }) {
  const s = await Session.findById(sessionId);
  if (!s) throw new Error('Session not found');

  const { rawMinutes, billMinutes } = computeMinutes(
    s.startTime,
    endAt,
    { ...s.billingRuleSnapshot }
  );
  const playAmount = computePlayAmount(s.tableTypeSnapshot.ratePerHour, billMinutes);
  const serviceAmount = s.serviceAmount || 0;
  const subTotal = playAmount + serviceAmount;

  return {
    rawMinutes,
    billMinutes,
    playAmount,
    serviceAmount,
    subTotal,
    items: s.items,
  };
}

/**
 * Checkout: chốt phiên + tạo bill (đã thanh toán)
 * - Có thể truyền sẵn discountLines (áp mã giảm/khuyến mãi từ nơi khác), surcharge & paymentMethod
 * - Mặc định đánh dấu paid=true; nếu muốn giữ bill chưa trả, set paid=false
 */
async function checkoutSession({
  sessionId,
  staffEnd,
  endAt = new Date(),
  discountLines = [],     // [{name, type:'percent'|'value', value, amount? , meta?}]
  surcharge = 0,
  paymentMethod = 'cash',
  paid = true,
}) {
  return withTransaction(async (tx) => {
    const s = await Session.findById(sessionId).session(tx);
    if (!s) throw new Error('Session not found');
    if (s.status !== 'open') throw new Error('Session already closed');

    // Tính phút & tiền giờ
    const { billMinutes } = computeMinutes(s.startTime, endAt, { ...s.billingRuleSnapshot });
    const playAmount = computePlayAmount(s.tableTypeSnapshot.ratePerHour, billMinutes);

    // Map items dịch vụ sang bill items
    const svcItems = (s.items || []).map(it => ({
      type: 'product',
      productId: it.product || null,
      nameSnapshot: it.nameSnapshot,
      priceSnapshot: it.priceSnapshot,
      qty: it.qty,
      amount: Math.max(0, Math.round((it.priceSnapshot || 0) * (it.qty || 0))),
      note: it.note || '',
    }));

    // Item PLAY
    const playItem = {
      type: 'play',
      minutes: billMinutes,
      ratePerHour: s.tableTypeSnapshot.ratePerHour,
      amount: playAmount,
    };

    // Tạo Bill
    const bill = await Bill.create([{
      session: s._id,
      table: s.table,
      tableName: undefined, // có thể populate Table để snapshot name nếu muốn
      items: [playItem, ...svcItems],
      playAmount,
      serviceAmount: svcItems.reduce((sum, x) => sum + x.amount, 0),
      subTotal: 0, // để pre('validate') tự tính
      discounts: Array.isArray(discountLines) ? discountLines : [],
      surcharge: Math.max(0, Number(surcharge || 0)),
      total: 0,    // để pre('validate') tự tính
      paid: !!paid,
      paidAt: paid ? new Date() : null,
      paymentMethod,
      staff: staffEnd || s.staffStart,
      branchId: s.branchId || null,
    }], { session: tx }).then(x => x[0]);

    // Cập nhật session
    s.endTime = endAt;
    s.durationMinutes = billMinutes;
    s.status = 'closed';
    s.staffEnd = staffEnd || s.staffStart;
    await s.save({ session: tx });

    // Cập nhật trạng thái bàn
    const table = await Table.findById(s.table).session(tx);
    if (table) {
      table.status = 'available';
      await table.save({ session: tx });
    }

    return { bill, session: s };
  });
}

// ======================= Exports =======================

module.exports = {
  // settings / pricing
  getActiveSetting,
  resolveRatePerHour,
  buildTableTypeSnapshot,
  buildBillingRuleSnapshot,

  // minutes & amount
  computeMinutes,
  computePlayAmount,

  // session lifecycle
  openSession,
  addItem,
  updateItemQty,
  removeItem,
  previewClose,
  checkoutSession,
};
