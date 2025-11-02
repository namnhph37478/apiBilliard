// utils/codegen.js
// CommonJS friendly, KHÔNG top-level await

const crypto = require('crypto');

function randomBytes(n = 8) {
  return crypto.randomBytes(n);
}

function randomString(len = 8) {
  // base36 từ random bytes
  const s = randomBytes(Math.ceil(len)).toString('base64url') // [A-Za-z0-9-_]
    .replace(/[-_]/g, '')                                    // chỉ chữ + số
    .toLowerCase();
  return s.slice(0, len);
}

function randomDigits(len = 4) {
  let out = '';
  while (out.length < len) {
    const n = crypto.randomInt(0, 10);
    out += String(n);
  }
  return out;
}

function pad(num, width = 2) {
  const s = String(num);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function toSlug(str = '') {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .replace(/[^a-zA-Z0-9]+/g, '-')                   // non-alnum -> -
    .replace(/^-+|-+$/g, '')                          // trim -
    .toLowerCase();
}

function makeSkuFromName(name = '', max = 12) {
  const base = toSlug(name).replace(/-/g, '');
  const head = (base || 'SKU').slice(0, Math.max(3, Math.min(max - 3, base.length || 3)));
  const tail = randomString(Math.max(0, max - head.length)).toUpperCase();
  return (head + tail).toUpperCase();
}

function yyyymmdd(d = new Date()) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1, 2);
  const dd = pad(d.getDate(), 2);
  return `${y}${m}${dd}`;
}

function makeBillCode(date = new Date()) {
  // Ví dụ: BILL-20251022-4821
  return `BILL-${yyyymmdd(date)}-${randomDigits(4)}`;
}

function makeSessionCode(date = new Date()) {
  // Ví dụ: SES-20251022-AB12
  return `SES-${yyyymmdd(date)}-${randomString(4).toUpperCase()}`;
}

function makeCode(prefix = 'CODE', len = 6) {
  return `${String(prefix).toUpperCase()}-${randomString(len).toUpperCase()}`;
}

module.exports = {
  randomString,
  randomDigits,
  pad,
  toSlug,
  makeSkuFromName,
  makeBillCode,
  makeSessionCode,
  makeCode,
};
