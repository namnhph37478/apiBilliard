// routes/v1/settings.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/setting.controller');
const schema = require('../../validators/setting.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole, requireAdmin } = require('../../middlewares/role.middleware');

// ---- Public-for-staff/admin: xem cấu hình hiệu lực & hiện tại ----
router.get('/settings/effective', requireAuth, requireRole(['staff', 'admin']), ctrl.getEffective);
router.get('/settings', requireAuth, requireRole(['staff', 'admin']), validate(schema.getCurrent), ctrl.getCurrent);

// ---- Admin only: upsert và cập nhật từng phần ----
router.put('/settings', requireAuth, requireAdmin, validate(schema.upsert), ctrl.upsert);

router.patch('/settings/shop', requireAuth, requireAdmin, validate(schema.setShop), ctrl.setShop);
router.patch('/settings/billing', requireAuth, requireAdmin, validate(schema.setBilling), ctrl.setBilling);
router.patch('/settings/print', requireAuth, requireAdmin, validate(schema.setPrint), ctrl.setPrint);
router.patch('/settings/e-receipt', requireAuth, requireAdmin, validate(schema.setEReceipt), ctrl.setEReceipt);
router.patch('/settings/backup', requireAuth, requireAdmin, validate(schema.setBackup), ctrl.setBackup);

// ---- (tuỳ chọn) Admin utilities ----
router.get('/settings/all', requireAuth, requireAdmin, ctrl.listAll);
router.get('/settings/:id', requireAuth, requireAdmin, ctrl.getById);
router.delete('/settings/:id', requireAuth, requireAdmin, ctrl.remove);

module.exports = router;
