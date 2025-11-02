// services/export.service.js
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const Bill = require('../models/bill.model');
const Table = require('../models/table.model');
const Product = require('../models/product.model');
const Setting = require('../models/setting.model');

const { summaryReport, revenueTimeseries, topTables, topProducts, revenueByStaff, revenueByPaymentMethod } = require('./report.service');
const { getActiveSetting } = require('./billing.service'); // dùng lại setting active

// ----------------------- Paths & helpers -----------------------
const EXPORT_DIR = path.join(process.cwd(), 'storage', 'exports');
ensureDir(EXPORT_DIR);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function nowStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const H = String(d.getHours()).padStart(2, '0');
  const M = String(d.getMinutes()).padStart(2, '0');
  const S = String(d.getSeconds()).padStart(2, '0');
  return `${y}${mm}${dd}_${H}${M}${S}`;
}
function fmtDate(dt) {
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const H = String(d.getHours()).padStart(2, '0');
  const M = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${da} ${H}:${M}`;
}
function fmtVND(n) {
  const v = Number(n || 0);
  try { return v.toLocaleString('vi-VN'); } catch { return String(Math.round(v)); }
}
function ensureRange({ from, to }) {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.setHours(0,0,0,0));
  const end = to ? new Date(to) : new Date(); // tới hiện tại
  if (!to) end.setHours(23,59,59,999);
  return { from: start, to: end };
}

// ----------------------- Excel: Bills list -----------------------
/**
 * Xuất Excel danh sách hóa đơn trong khoảng thời gian.
 * @param {Object} opt
 *  - from, to, branchId, paidOnly=true
 *  - filename?: string (tùy chọn)
 *  - columns?: string[] (mặc định bộ cột chuẩn)
 * @returns {Promise<{filePath: string, filename: string}>}
 */
async function exportBillsExcel(opt = {}) {
  const { from, to, branchId = null, paidOnly = true } = opt;
  const range = ensureRange({ from, to });

  const q = { createdAt: { $gte: range.from, $lte: range.to } };
  if (branchId) q.branchId = branchId;
  if (paidOnly) q.paid = true;

  const bills = await Bill.find(q)
    .select('code createdAt paid paidAt paymentMethod table tableName staff playAmount serviceAmount discounts surcharge total items')
    .populate('staff', 'name username')
    .populate('table', 'name')
    .sort({ createdAt: 1 })
    .lean();

  // Chuẩn hóa dữ liệu
  const rows = bills.map(b => {
    const discountTotal = (b.discounts || []).reduce((s, d) => s + Number(d.amount || 0), 0);
    const tableName = b.tableName || b.table?.name || '';
    const staffName = b.staff?.name || b.staff?.username || '';
    const minutes = (b.items || []).filter(it => it.type === 'play').reduce((s, it) => s + Number(it.minutes || 0), 0);
    const playRate = (b.items || []).find(it => it.type === 'play')?.ratePerHour || 0;

    return {
      code: b.code,
      createdAt: fmtDate(b.createdAt),
      paidAt: b.paid ? fmtDate(b.paidAt || b.createdAt) : '',
      table: tableName,
      staff: staffName,
      minutes,
      playRate,
      playAmount: b.playAmount || 0,
      serviceAmount: b.serviceAmount || 0,
      discountTotal,
      surcharge: b.surcharge || 0,
      total: b.total || 0,
      paymentMethod: b.paymentMethod || '',
      paid: b.paid ? 'Yes' : 'No',
    };
  });

  // Workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = 'apiBiliard';
  wb.created = new Date();

  const ws = wb.addWorksheet('Bills', { views: [{ state: 'frozen', ySplit: 1 }] });

  const columns = [
    { header: 'Code', key: 'code', width: 22 },
    { header: 'Created At', key: 'createdAt', width: 20 },
    { header: 'Paid At', key: 'paidAt', width: 20 },
    { header: 'Table', key: 'table', width: 16 },
    { header: 'Staff', key: 'staff', width: 18 },
    { header: 'Minutes', key: 'minutes', width: 10 },
    { header: 'Rate/h', key: 'playRate', width: 10 },
    { header: 'Play Amount', key: 'playAmount', width: 14 },
    { header: 'Service Amount', key: 'serviceAmount', width: 16 },
    { header: 'Discount', key: 'discountTotal', width: 12 },
    { header: 'Surcharge', key: 'surcharge', width: 12 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Payment', key: 'paymentMethod', width: 12 },
    { header: 'Paid', key: 'paid', width: 8 },
  ];
  ws.columns = columns;

  // Header bold
  ws.getRow(1).font = { bold: true };

  // Fill rows
  rows.forEach(r => ws.addRow(r));

  // Number formats
  const moneyCols = ['H', 'I', 'J', 'K', 'L']; // columns for amounts
  for (let i = 2; i <= ws.rowCount; i++) {
    moneyCols.forEach(col => {
      const cell = ws.getCell(`${col}${i}`);
      cell.numFmt = '#,##0';
    });
  }

  // Footer totals
  const last = ws.rowCount + 1;
  ws.addRow({});
  ws.getCell(`G${last + 1}`).value = 'Totals:';
  ws.getCell(`G${last + 1}`).font = { bold: true };
  ['H','I','J','K','L'].forEach((col, idx) => {
    const colLetter = ['H','I','J','K','L'][idx];
    const formula = `SUM(${colLetter}2:${colLetter}${last - 1})`;
    ws.getCell(`${col}${last + 1}`).value = { formula };
    ws.getCell(`${col}${last + 1}`).numFmt = '#,##0';
    ws.getCell(`${col}${last + 1}`).font = { bold: true };
  });

  // Save
  const filename = opt.filename || `bills_${nowStamp()}.xlsx`;
  const filePath = path.join(EXPORT_DIR, filename);
  await wb.xlsx.writeFile(filePath);

  return { filePath, filename };
}

// ----------------------- Excel: Reports pack -----------------------
/**
 * Xuất Excel nhiều sheet: Summary, Daily, TopTables, TopProductsQty, TopProductsAmount, ByStaff, ByPayment
 */
async function exportReportsExcel({ from, to, branchId = null, paidOnly = true } = {}) {
  const range = ensureRange({ from, to });

  // Load data via report.service
  const [summary, daily, tables, topQty, topAmount, staff, payments] = await Promise.all([
    summaryReport({ ...range, branchId, paidOnly }),
    revenueTimeseries({ ...range, branchId, paidOnly }),
    topTables({ ...range, branchId, paidOnly, limit: 20 }),
    topProducts({ ...range, branchId, paidOnly, limit: 20, by: 'qty' }),
    topProducts({ ...range, branchId, paidOnly, limit: 20, by: 'amount' }),
    revenueByStaff({ ...range, branchId, paidOnly, limit: 50 }),
    revenueByPaymentMethod({ ...range, branchId, paidOnly }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'apiBiliard';
  wb.created = new Date();

  // Summary
  const wsSum = wb.addWorksheet('Summary');
  wsSum.addRow(['From', fmtDate(range.from)]);
  wsSum.addRow(['To', fmtDate(range.to)]);
  wsSum.addRow([]);
  wsSum.addRow(['Bills', summary.bills || 0]);
  wsSum.addRow(['Bills Paid', summary.billsPaid || 0]);
  wsSum.addRow(['Play Amount', summary.playAmount || 0]);
  wsSum.addRow(['Service Amount', summary.serviceAmount || 0]);
  wsSum.addRow(['Discount', summary.discountTotal || 0]);
  wsSum.addRow(['Surcharge', summary.surcharge || 0]);
  wsSum.addRow(['Total', summary.total || 0]);
  wsSum.addRow(['Avg Ticket', summary.avgTicket || 0]);
  // number formats
  ['B6','B7','B8','B9','B10','B11'].forEach(addr => wsSum.getCell(addr).numFmt = '#,##0');

  // Daily
  const wsDaily = wb.addWorksheet('Daily');
  wsDaily.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Bills', key: 'bills', width: 8 },
    { header: 'Play Amount', key: 'playAmount', width: 14 },
    { header: 'Service Amount', key: 'serviceAmount', width: 16 },
    { header: 'Discount', key: 'discountTotal', width: 12 },
    { header: 'Surcharge', key: 'surcharge', width: 12 },
    { header: 'Total', key: 'total', width: 14 },
  ];
  wsDaily.getRow(1).font = { bold: true };
  daily.forEach(r => wsDaily.addRow(r));
  for (let i = 2; i <= wsDaily.rowCount; i++) {
    ['C','D','E','F','G'].forEach(col => wsDaily.getCell(`${col}${i}`).numFmt = '#,##0');
  }

  // TopTables
  const wsTbl = wb.addWorksheet('TopTables');
  wsTbl.columns = [
    { header: 'Table', key: 'tableName', width: 16 },
    { header: 'Minutes', key: 'minutes', width: 10 },
    { header: 'Play Amount', key: 'playAmount', width: 14 },
    { header: 'Service Amount', key: 'serviceAmount', width: 16 },
    { header: 'Total', key: 'total', width: 14 },
  ];
  wsTbl.getRow(1).font = { bold: true };
  tables.forEach(r => wsTbl.addRow(r));
  for (let i = 2; i <= wsTbl.rowCount; i++) {
    ['B','C','D','E'].forEach(col => wsTbl.getCell(`${col}${i}`).numFmt = '#,##0');
  }

  // TopProducts (Qty)
  const wsPQ = wb.addWorksheet('TopProductsQty');
  wsPQ.columns = [
    { header: 'Product', key: 'name', width: 26 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Amount', key: 'amount', width: 14 },
  ];
  wsPQ.getRow(1).font = { bold: true };
  topQty.forEach(r => wsPQ.addRow(r));
  for (let i = 2; i <= wsPQ.rowCount; i++) {
    ['B','C'].forEach(col => wsPQ.getCell(`${col}${i}`).numFmt = '#,##0');
  }

  // TopProducts (Amount)
  const wsPA = wb.addWorksheet('TopProductsAmount');
  wsPA.columns = [
    { header: 'Product', key: 'name', width: 26 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Amount', key: 'amount', width: 14 },
  ];
  wsPA.getRow(1).font = { bold: true };
  topAmount.forEach(r => wsPA.addRow(r));
  for (let i = 2; i <= wsPA.rowCount; i++) {
    ['B','C'].forEach(col => wsPA.getCell(`${col}${i}`).numFmt = '#,##0');
  }

  // ByStaff
  const wsStaff = wb.addWorksheet('ByStaff');
  wsStaff.columns = [
    { header: 'Staff Id', key: 'staff', width: 26 },
    { header: 'Bills', key: 'bills', width: 10 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Avg Ticket', key: 'avgTicket', width: 12 },
  ];
  wsStaff.getRow(1).font = { bold: true };
  staff.forEach(r => wsStaff.addRow(r));
  for (let i = 2; i <= wsStaff.rowCount; i++) {
    ['B','C','D'].forEach(col => wsStaff.getCell(`${col}${i}`).numFmt = '#,##0');
  }

  // ByPayment
  const wsPay = wb.addWorksheet('ByPayment');
  wsPay.columns = [
    { header: 'Method', key: 'paymentMethod', width: 16 },
    { header: 'Bills', key: 'bills', width: 10 },
    { header: 'Total', key: 'total', width: 14 },
  ];
  wsPay.getRow(1).font = { bold: true };
  payments.forEach(r => wsPay.addRow(r));
  for (let i = 2; i <= wsPay.rowCount; i++) {
    ['B','C'].forEach(col => wsPay.getCell(`${col}${i}`).numFmt = '#,##0');
  }

  const filename = `reports_${nowStamp()}.xlsx`;
  const filePath = path.join(EXPORT_DIR, filename);
  await wb.xlsx.writeFile(filePath);
  return { filePath, filename };
}

// ----------------------- PDF: Bill receipt -----------------------
/**
 * Xuất PDF hóa đơn.
 * @param {String} billId
 * @param {Object} opt
 *  - paperSize: '58mm'|'80mm'|'A4' (mặc định '80mm')
 *  - filename?: string
 *  - embedQR?: boolean (nếu có eReceipt.baseUrl và muốn chèn QR)
 * @returns {Promise<{filePath:string, filename:string}>}
 */
async function exportBillPDF(billId, opt = {}) {
  const paper = opt.paperSize || '80mm';

  // Load bill + setting
  const bill = await Bill.findById(billId).populate('staff', 'name username').populate('table', 'name').lean();
  if (!bill) throw new Error('Bill not found');

  const setting = await getActiveSetting(bill.branchId || null);

  // Page size
  let size = 'A4';
  if (paper === '58mm') size = [mmToPt(58), mmToPt(200)]; // height tạm; doc sẽ thêm trang nếu thiếu
  if (paper === '80mm') size = [mmToPt(80), mmToPt(300)];

  const filename = opt.filename || `bill_${bill.code}_${nowStamp()}.pdf`;
  const filePath = path.join(EXPORT_DIR, filename);

  const doc = new PDFDocument({
    size,
    margins: paper === 'A4'
      ? { top: 36, left: 36, right: 36, bottom: 36 }
      : { top: 10, left: 10, right: 10, bottom: 10 }
  });
  doc.pipe(fs.createWriteStream(filePath));

  const shop = setting.getReceiptInfo().shop;
  const print = setting.getReceiptInfo().print;
  const eReceipt = setting.getReceiptInfo().eReceipt;

  // Header
  doc.fontSize( paper === 'A4' ? 16 : 12 ).text(shop.name || 'Billiard POS', { align: 'center' });
  if (shop.address) doc.fontSize(paper === 'A4' ? 10 : 8).text(shop.address, { align: 'center' });
  if (shop.phone) doc.fontSize(paper === 'A4' ? 10 : 8).text(`Tel: ${shop.phone}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(paper === 'A4' ? 12 : 10).text(`HÓA ĐƠN: ${bill.code}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).text(`Ngày: ${fmtDate(bill.createdAt)}`, { align: 'center' });
  doc.fontSize(9).text(`Bàn: ${bill.table?.name || bill.tableName || ''}   Thu ngân: ${bill.staff?.name || bill.staff?.username || ''}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();

  // Items
  doc.moveDown(0.5);
  doc.fontSize( paper === 'A4' ? 10 : 8 ).text('Danh mục', { continued: true })
     .text('SL', { align: 'center', continued: true, width: 40 })
     .text('Đơn giá', { align: 'right', continued: true })
     .text('Thành tiền', { align: 'right' });
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();

  const line = (name, qty, price, amount) => {
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const col1 = Math.floor(w * 0.45);
    const col2 = Math.floor(w * 0.15);
    const col3 = Math.floor(w * 0.20);
    const col4 = Math.floor(w * 0.20);

    const x = doc.x, y = doc.y;
    doc.fontSize(paper === 'A4' ? 10 : 8).text(name, x, y, { width: col1, continued: true });
    doc.text(qty, x + col1, y, { width: col2, align: 'center', continued: true });
    doc.text(fmtVND(price), x + col1 + col2, y, { width: col3, align: 'right', continued: true });
    doc.text(fmtVND(amount), x + col1 + col2 + col3, y, { width: col4, align: 'right' });
  };

  // PLAY item(s)
  const playItems = (bill.items || []).filter(i => i.type === 'play');
  playItems.forEach(it => {
    const name = `Tiền giờ (${it.minutes}’ @ ${fmtVND(it.ratePerHour)}/h)`;
    line(name, 1, it.ratePerHour || 0, it.amount || 0);
  });

  // PRODUCT items
  (bill.items || []).filter(i => i.type === 'product').forEach(it => {
    line(it.nameSnapshot || 'Sản phẩm', it.qty || 0, it.priceSnapshot || 0, it.amount || 0);
  });

  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();

  // Totals
  const labelVal = (label, value, bold = false) => {
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colL = Math.floor(w * 0.65);
    const colR = Math.floor(w * 0.35);
    const x = doc.x, y = doc.y;
    doc.fontSize(paper === 'A4' ? 11 : 9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, x, y, { width: colL, continued: true });
    doc.text(fmtVND(value), x + colL, y, { width: colR, align: 'right' }).font('Helvetica');
  };

  labelVal('Tiền giờ', bill.playAmount || 0);
  labelVal('Dịch vụ', bill.serviceAmount || 0);

  const discountTotal = (bill.discounts || []).reduce((s, d) => s + Number(d.amount || 0), 0);
  if (discountTotal > 0) labelVal('Giảm giá', -discountTotal);
  if (bill.surcharge) labelVal('Phụ thu', bill.surcharge || 0);

  doc.moveDown(0.3);
  labelVal('TỔNG CỘNG', bill.total || 0, true);
  doc.moveDown(0.5);
  doc.fontSize(9).text(`Thanh toán: ${bill.paymentMethod?.toUpperCase?.() || 'CASH'}`, { align: 'left' });
  if (bill.paid) doc.fontSize(9).text(`Đã thanh toán lúc: ${fmtDate(bill.paidAt || bill.createdAt)}`);

  // Footer & QR
  doc.moveDown(0.8);
  if (print.footerLines?.length) {
    print.footerLines.forEach(lineText => doc.fontSize(8).text(lineText, { align: 'center' }));
    doc.moveDown(0.3);
  }
  if (print.showQR && eReceipt.enabled && eReceipt.baseUrl && bill.code) {
    const url = `${eReceipt.baseUrl.replace(/\/+$/,'')}/bills/${encodeURIComponent(bill._id)}/print`;
    // Nhẹ nhàng: chỉ in URL (không bắt buộc QR để tránh phụ thuộc thêm)
    doc.fontSize(8).text('Xem hóa đơn điện tử:', { align: 'center' });
    doc.fontSize(8).fillColor('#1d4ed8').text(url, { align: 'center', link: url, underline: true }).fillColor('black');
  }

  doc.end();
  return { filePath, filename };
}

function mmToPt(mm) {
  return (mm / 25.4) * 72; // 1 inch = 25.4mm = 72pt
}

// ----------------------- Exports -----------------------
module.exports = {
  exportBillsExcel,
  exportReportsExcel,
  exportBillPDF,
  EXPORT_DIR,
};
