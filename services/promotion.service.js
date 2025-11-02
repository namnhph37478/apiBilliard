// services/promotion.service.js
const mongoose = require('mongoose');
const Promotion = require('../models/promotion.model');
const Product = require('../models/product.model');

/** ------------------------- Utils: time helpers ------------------------- */
function hhmm(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function hhmmToMinutes(s) {
  const [h, m] = (s || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
}
function inTimeRange(cur, from, to) {
  // Hỗ trợ qua đêm (from > to)
  const c = hhmmToMinutes(cur);
  const f = hhmmToMinutes(from);
  const t = hhmmToMinutes(to);
  if (Number.isNaN(f) || Number.isNaN(t)) return true;
  if (f <= t) return c >= f && c <= t;
  return c >= f || c <= t;
}

/** Clamp & round VND */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function roundVND(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

/** ------------------------- Load promotions ------------------------- */
/**
 * Lấy danh sách khuyến mãi đang kích hoạt theo chi nhánh & thời điểm
 * (lọc coarse theo validFrom/validTo; điều kiện sâu hơn kiểm trong code)
 */
async function getActivePromotions({ branchId = null, at = new Date() } = {}) {
  const q = {
    active: true,
    $and: [
      { $or: [{ 'timeRule.validFrom': null }, { 'timeRule.validFrom': { $lte: at } }] },
      { $or: [{ 'timeRule.validTo': null }, { 'timeRule.validTo': { $gte: at } }] },
    ],
  };
  if (branchId) q.branchId = branchId; else q.branchId = null;

  const promos = await Promotion.find(q).sort({ applyOrder: 1, createdAt: 1 }).lean();
  return promos;
}

/** ------------------------- Evaluate gates ------------------------- */
function promoIsActiveAt(promo, at = new Date()) {
  // dùng method trong model nếu có; ở đây kiểm nhanh (đề phòng lean())
  const tr = promo.timeRule || {};
  const { validFrom, validTo, daysOfWeek = [], timeRanges = [] } = tr;

  if (validFrom && new Date(at) < new Date(validFrom)) return false;
  if (validTo && new Date(at) > new Date(validTo).setHours(23, 59, 59, 999)) return false;

  if (Array.isArray(daysOfWeek) && daysOfWeek.length) {
    const dow = new Date(at).getDay();
    if (!daysOfWeek.includes(dow)) return false;
  }

  if (Array.isArray(timeRanges) && timeRanges.length) {
    const cur = hhmm(new Date(at));
    const hit = timeRanges.some(r => r?.from && r?.to && inTimeRange(cur, r.from, r.to));
    if (!hit) return false;
  }
  return true;
}

function includesObjectId(arr, id) {
  if (!id) return false;
  const s = String(id);
  return (arr || []).some(x => String(x) === s);
}

/** ------------------------- Compute base amounts ------------------------- */
/**
 * baseAmounts giữ "phần còn lại có thể giảm" cho từng mục tiêu:
 *   - playRemaining, serviceRemaining, billRemaining (bắt đầu = giá trị gốc)
 * Mỗi khuyến mãi giảm xong sẽ trừ vào remaining tương ứng để tránh giảm quá.
 */
function buildBaseAmounts({ playAmount = 0, serviceAmount = 0, subTotal = 0 }) {
  return {
    playRemaining: roundVND(playAmount),
    serviceRemaining: roundVND(serviceAmount),
    billRemaining: roundVND(subTotal),
  };
}

function pickTargetBase(remaining, applyTo) {
  if (applyTo === 'play') return remaining.playRemaining;
  if (applyTo === 'service') return remaining.serviceRemaining;
  return remaining.billRemaining; // 'bill'
}

function deductTargetBase(remaining, applyTo, amount) {
  if (applyTo === 'play') remaining.playRemaining = clamp(remaining.playRemaining - amount, 0, Infinity);
  else if (applyTo === 'service') remaining.serviceRemaining = clamp(remaining.serviceRemaining - amount, 0, Infinity);
  else remaining.billRemaining = clamp(remaining.billRemaining - amount, 0, Infinity);
}

/** ------------------------- Product helpers ------------------------- */
/**
 * Chuẩn hoá danh sách item dịch vụ để dùng cho scope=product:
 * [{ productId, categoryId, price, qty, amount }]
 * - If categoryId chưa có, sẽ truy vấn Product để lấy category.
 */
async function normalizeServiceItems(serviceItems) {
  if (!Array.isArray(serviceItems) || !serviceItems.length) return [];
  const needs = serviceItems.filter(it => !it.categoryId && it.productId).map(it => it.productId);
  let catMap = {};
  if (needs.length) {
    const docs = await Product.find({ _id: { $in: needs } }).select('_id category').lean();
    catMap = Object.fromEntries(docs.map(d => [String(d._id), String(d.category)]));
  }
  return serviceItems.map(it => ({
    productId: it.productId ? String(it.productId) : null,
    categoryId: it.categoryId ? String(it.categoryId) : (it.productId ? catMap[String(it.productId)] || null : null),
    price: Number(it.price || it.priceSnapshot || 0),
    qty: Number(it.qty || 0),
    amount: roundVND(it.amount != null ? it.amount : (Number(it.price || it.priceSnapshot || 0) * Number(it.qty || 0))),
  }));
}

/** Tổng tiền các item phù hợp theo rule */
function sumEligibleProductAmount(items, productRule) {
  if (!productRule) return 0;
  const allowCats = (productRule.categories || []).map(String);
  const allowProds = (productRule.products || []).map(String);

  const eligible = items.filter(it => {
    const okProd = !allowProds.length || allowProds.includes(it.productId);
    const okCat  = !allowCats.length || allowCats.includes(it.categoryId);
    return okProd && okCat;
  });

  // Combo (đơn giản): nếu có định nghĩa combo, yêu cầu mỗi sản phẩm đạt min qty
  if (Array.isArray(productRule.combo) && productRule.combo.length) {
    const okCombo = productRule.combo.every(c => {
      const found = items.find(it => it.productId === String(c.product));
      return found && found.qty >= Number(c.qty || 1);
    });
    if (!okCombo) return 0;
    // nếu combo đạt, vẫn tính trên eligible amount (có thể điều chỉnh tuỳ yêu cầu)
  }

  return eligible.reduce((s, it) => s + roundVND(it.amount), 0);
}

/** ------------------------- Discount calculation ------------------------- */
function computeDiscountValue(discount, baseAmount) {
  const type = discount?.type || 'value';
  const value = Number(discount?.value || 0);
  const maxAmount = discount?.maxAmount != null ? Number(discount.maxAmount) : null;

  let amt = 0;
  if (type === 'percent') {
    const pct = clamp(value, 0, 100);
    amt = Math.round((baseAmount * pct) / 100);
  } else {
    amt = roundVND(value);
  }

  if (maxAmount != null) amt = Math.min(amt, Math.max(0, Number(maxAmount)));
  return clamp(amt, 0, baseAmount);
}

/** ------------------------- Core apply engine ------------------------- */
/**
 * Áp danh sách khuyến mãi lên bối cảnh hóa đơn
 * @param {Object} ctx
 *  - at: Date
 *  - tableTypeId: ObjectId|string
 *  - playMinutes: number
 *  - playAmount: number
 *  - serviceItems: [{productId, categoryId?, price, qty, amount}]
 *  - serviceAmount: number
 *  - subTotal: number
 *  - branchId: ObjectId|string|null
 *  - promotions?: array (optional) nếu đã tải sẵn
 * @returns { discounts: DiscountLine[], summary: { playRemaining, serviceRemaining, billRemaining, discountTotal } }
 */
async function applyPromotions(ctx) {
  const at = ctx.at ? new Date(ctx.at) : new Date();

  // Chuẩn hoá items (gắn categoryId nếu thiếu)
  const items = await normalizeServiceItems(ctx.serviceItems || []);

  // Tải khuyến mãi nếu chưa có
  let promotions = ctx.promotions;
  if (!Array.isArray(promotions)) {
    promotions = await getActivePromotions({ branchId: ctx.branchId || null, at });
  }

  // Sắp xếp theo applyOrder đã sort từ DB; nếu cần ràng buộc bổ sung, có thể sort lại
  const remaining = buildBaseAmounts({
    playAmount: ctx.playAmount || 0,
    serviceAmount: ctx.serviceAmount || 0,
    subTotal: ctx.subTotal || 0,
  });

  const lines = [];
  let stopDueToNonStackable = false;

  for (const promo of promotions) {
    if (stopDueToNonStackable) break;
    if (!promoIsActiveAt(promo, at)) continue;

    const applyTo = promo?.discount?.applyTo || 'bill';
    const targetBase = pickTargetBase(remaining, applyTo);
    if (targetBase <= 0) continue; // không còn gì để giảm

    let eligibleBase = 0;
    let ok = true;
    const meta = { promoId: String(promo._id || ''), scope: promo.scope, code: promo.code };

    if (promo.scope === 'time') {
      // Điều kiện loại bàn / phút chơi
      const tt = (promo.timeRule?.tableTypes || []).map(String);
      if (tt.length && !includesObjectId(tt, ctx.tableTypeId)) ok = false;

      const minMin = Number(promo.timeRule?.minMinutes || 0);
      if (ctx.playMinutes != null && ctx.playMinutes < minMin) ok = false;

      eligibleBase = targetBase; // áp trực tiếp lên target chọn (play/service/bill)
    }

    else if (promo.scope === 'product') {
      const base = sumEligibleProductAmount(items, promo.productRule || {});
      if (applyTo === 'service') {
        eligibleBase = Math.min(targetBase, base);
      } else if (applyTo === 'bill') {
        // có thể cho phép áp lên bill nhưng không vượt quá phần dịch vụ đủ điều kiện
        eligibleBase = Math.min(targetBase, base);
      } else {
        // áp lên play là không hợp lý với product scope
        ok = false;
      }
      meta.eligibleServiceBase = base;
    }

    else if (promo.scope === 'bill') {
      const br = promo.billRule || {};
      const tt = (br.tableTypes || []).map(String);
      if (tt.length && !includesObjectId(tt, ctx.tableTypeId)) ok = false;

      const minSubtotal = Number(br.minSubtotal || 0);
      if ((ctx.subTotal || 0) < minSubtotal) ok = false;

      const minServiceAmount = Number(br.minServiceAmount || 0);
      if ((ctx.serviceAmount || 0) < minServiceAmount) ok = false;

      const minPlayMinutes = Number(br.minPlayMinutes || 0);
      if ((ctx.playMinutes || 0) < minPlayMinutes) ok = false;

      eligibleBase = targetBase;
    }

    else {
      ok = false;
    }

    if (!ok) continue;
    if (eligibleBase <= 0) continue;

    // Tính số tiền giảm theo rule
    const cut = computeDiscountValue(promo.discount, eligibleBase);
    if (cut <= 0) continue;

    // Cập nhật remaining trên mục tiêu
    deductTargetBase(remaining, applyTo, cut);

    lines.push({
      name: promo.name,
      type: promo.discount.type,
      value: promo.discount.value,
      amount: cut,
      meta,
    });

    if (promo.stackable === false) {
      stopDueToNonStackable = true;
    }
  }

  const discountTotal = lines.reduce((s, d) => s + roundVND(d.amount || 0), 0);
  return { discounts: lines, summary: { ...remaining, discountTotal } };
}

/** ------------------------- Build context helpers ------------------------- */
/**
 * Tạo bill context từ dữ liệu phiên (Session) đã lưu — dùng khi muốn
 * tính khuyến mãi trước khi checkout.
 * @param {Object} s  - Document Session (đã populate nếu cần)
 * @param {Object} opt
 *  - endAt: Date (mặc định now)
 *  - preview: {billMinutes, playAmount, serviceAmount, subTotal}?  // nếu có sẵn từ billing.previewClose()
 *  - serviceItemsFromSession: boolean (default true) // lấy từ s.items
 */
function buildContextFromSession(s, opt = {}) {
  const endAt = opt.endAt ? new Date(opt.endAt) : new Date();
  let playMinutes, playAmount, serviceAmount, subTotal;

  if (opt.preview) {
    playMinutes = opt.preview.billMinutes;
    playAmount = opt.preview.playAmount;
    serviceAmount = opt.preview.serviceAmount;
    subTotal = opt.preview.subTotal;
  } else {
    // Nếu chưa có preview, dùng snapshot ở session (thường cần gọi billing.previewClose trước)
    playMinutes = s.durationMinutes || 0;
    // playAmount cần tính theo rate/h và durationMinutes — khuyến nghị: gọi previewClose trước
    playAmount = 0;
    serviceAmount = s.serviceAmount || 0;
    subTotal = (playAmount || 0) + (serviceAmount || 0);
  }

  const serviceItems = (s.items || []).map(it => ({
    productId: it.product ? String(it.product) : null,
    price: it.priceSnapshot,
    qty: it.qty,
    amount: (it.priceSnapshot || 0) * (it.qty || 0),
    // categoryId sẽ được fill bởi normalizeServiceItems nếu thiếu
  }));

  return {
    at: endAt,
    tableTypeId: s.tableTypeSnapshot?.typeId ? String(s.tableTypeSnapshot.typeId) : null,
    playMinutes,
    playAmount,
    serviceItems,
    serviceAmount,
    subTotal,
    branchId: s.branchId ? String(s.branchId) : null,
  };
}

module.exports = {
  getActivePromotions,
  applyPromotions,
  buildContextFromSession,
};
