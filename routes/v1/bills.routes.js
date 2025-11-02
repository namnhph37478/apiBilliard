// routes/v1/bills.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/bill.controller');
const schema = require('../../validators/bill.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole, requireAdmin } = require('../../middlewares/role.middleware');

// Nhân viên & quản lý: xem danh sách/chi tiết, thanh toán, cập nhật ghi chú, in/QR
router.get('/bills', requireAuth, requireRole(['staff', 'admin']), validate(schema.list), ctrl.list);
router.get('/bills/:id', requireAuth, requireRole(['staff', 'admin']), validate(schema.getOne), ctrl.getOne);
router.patch('/bills/:id/pay', requireAuth, requireRole(['staff', 'admin']), validate(schema.pay), ctrl.pay);
router.patch('/bills/:id/note', requireAuth, requireRole(['staff', 'admin']), validate(schema.setNote), ctrl.setNote);
router.get('/bills/:id/print', requireAuth, requireRole(['staff', 'admin']), validate(schema.print), ctrl.print);
router.get('/bills/:id/qr', requireAuth, requireRole(['staff', 'admin']), validate(schema.qr), ctrl.qr);

// Chỉ quản trị: export & xoá
router.get('/bills/export.xlsx', requireAuth, requireAdmin, validate(schema.exportExcel), ctrl.exportExcel);
router.delete('/bills/:id', requireAuth, requireAdmin, validate(schema.remove), ctrl.remove);

module.exports = router;
