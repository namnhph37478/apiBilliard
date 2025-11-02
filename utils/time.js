// utils/time.js

const DEFAULT_TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';
const HHMM_RE = /^\d{2}:\d{2}$/;

/** ===== Core helpers ===== */
function pad2(n) {
  return String(n).padStart(2, '0');
}
function toDate(input) {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  // ISO string / timestamp / anything Date hiểu được
  return new Date(input);
}

/** 'YYYY-MM-DD' */
function formatDate(date) {
  const d = toDate(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD HH:mm' */
function formatDateTime(date) {
  const d = toDate(date);
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Trả 'HH:mm' theo local time */
function toHHMM(date) {
  const d = toDate(date);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isHHMM(s) {
  return HHMM_RE.test(String(s || ''));
}

/** HH:mm → tổng phút từ 00:00 */
function hhmmToMinutes(s) {
  if (!isHHMM(s)) return NaN;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** tổng phút (>=0) → 'HH:mm' (24h mod, không gán ngày) */
function minutesToHHMM(mins) {
  let t = Math.max(0, Math.floor(Number(mins) || 0));
  t = t % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Kiểm tra cur ∈ [from, to] theo 'HH:mm', hỗ trợ khoảng qua đêm (from > to) */
function inTimeRange(cur, from, to) {
  const curM = hhmmToMinutes(cur);
  const f = hhmmToMinutes(from);
  const t = hhmmToMinutes(to);
  if (Number.isNaN(curM) || Number.isNaN(f) || Number.isNaN(t)) return true; // không đủ dữ liệu => coi như hợp lệ
  if (f === t) return curM === f; // biên chính xác 1 phút
  if (f < t) return curM >= f && curM <= t; // bình thường
  return curM >= f || curM <= t;            // qua đêm (vd 22:00→03:00)
}

/** Làm tròn phút theo step (1|5|10|15...) và mode 'ceil' | 'round' | 'floor' */
function roundMinutes(mins, step = 5, mode = 'ceil') {
  const m = Math.max(0, Number(mins) || 0);
  const s = Math.max(1, Number(step) || 1);
  const unit = m / s;
  if (mode === 'floor') return Math.floor(unit) * s;
  if (mode === 'round') return Math.round(unit) * s;
  return Math.ceil(unit) * s;
}

/** Khoảng miễn phí (grace) tính bằng phút; nếu m <= grace → 0, ngược lại làm tròn theo rule */
function applyGraceAndRound(mins, { roundingStep = 5, roundingMode = 'ceil', graceMinutes = 0 } = {}) {
  const m = Math.max(0, Number(mins) || 0);
  const grace = Math.max(0, Number(graceMinutes) || 0);
  if (m <= grace) return 0;
  return roundMinutes(m, roundingStep, roundingMode);
}

/** Chênh lệch phút giữa 2 thời điểm (mặc định end=now). ceil=true: làm tròn lên 1 phút */
function diffMinutes(start, end = new Date(), { ceil = true } = {}) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const raw = (e - s) / 60000;
  return Math.max(0, ceil ? Math.ceil(raw) : Math.floor(raw));
}

/** Đầu ngày (local) */
function startOfDay(date = new Date()) {
  const d = toDate(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Cuối ngày (local) */
function endOfDay(date = new Date()) {
  const d = toDate(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Thêm phút vào thời điểm */
function addMinutes(date, minutes) {
  const d = toDate(date);
  d.setMinutes(d.getMinutes() + Number(minutes || 0));
  return d;
}

/** Day of week (0=CN..6=T7) */
function dayOfWeek(date = new Date()) {
  return toDate(date).getDay();
}

/** Tạo khoảng thời gian mặc định hôm nay nếu thiếu from/to */
function ensureRange({ from, to } = {}) {
  const now = new Date();
  const start = from ? toDate(from) : startOfDay(now);
  const end = to ? toDate(to) : endOfDay(now);
  return { from: start, to: end, tz: DEFAULT_TZ };
}

/** Kiểm tra giao nhau giữa 2 khoảng HH:mm (có thể qua đêm) */
function timeRangeOverlap(aFrom, aTo, bFrom, bTo) {
  // Chuẩn hoá về phút trên vòng 24h, xét 2 trường hợp qua đêm
  const aF = hhmmToMinutes(aFrom), aT = hhmmToMinutes(aTo);
  const bF = hhmmToMinutes(bFrom), bT = hhmmToMinutes(bTo);
  if ([aF,aT,bF,bT].some(Number.isNaN)) return true;

  const segs = normalizeRanges24h([{ f: aF, t: aT }, { f: bF, t: bT }]);
  const [A, B] = segs;
  // Kiểm tra overlap giữa các đoạn đã chuẩn hoá (không qua đêm)
  return A.some(a => B.some(b => a.f <= b.t && b.f <= a.t));
}

/** Chuẩn hoá 1 mảng range phút (0..1439) có thể qua đêm -> thành 1 hoặc 2 đoạn không qua đêm */
function normalizeRanges24h(ranges) {
  const expand = ({ f, t }) => {
    if (f <= t) return [{ f, t }];
    // qua đêm → tách thành [f..1440) và [0..t]
    return [{ f, t: 24 * 60 - 1 }, { f: 0, t }];
  };
  return ranges.map(r => expand(r)).map(parts => parts.map(p => ({
    f: Math.max(0, Math.min(24 * 60 - 1, p.f)),
    t: Math.max(0, Math.min(24 * 60 - 1, p.t)),
  })));
}

module.exports = {
  DEFAULT_TZ,
  HHMM_RE,
  // format
  formatDate,
  formatDateTime,
  toHHMM,
  // parse/convert
  isHHMM,
  hhmmToMinutes,
  minutesToHHMM,
  inTimeRange,
  // rounding & minutes
  roundMinutes,
  applyGraceAndRound,
  diffMinutes,
  // date utils
  startOfDay,
  endOfDay,
  addMinutes,
  dayOfWeek,
  ensureRange,
  timeRangeOverlap,
};
