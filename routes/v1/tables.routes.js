// routes/v1/tables.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/table.controller');
const schema = require('../../validators/table.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole, requireAdmin } = require('../../middlewares/role.middleware');

// Nhân viên & quản lý có thể xem danh sách/chi tiết bàn
router.get('/tables', requireAuth, requireRole(['staff', 'admin']), validate(schema.list), ctrl.list);
router.get('/tables/:id', requireAuth, requireRole(['staff', 'admin']), validate(schema.getOne), ctrl.getOne);

// Quản trị CRUD bàn (chỉ admin)
router.post('/tables', requireAuth, requireAdmin, validate(schema.create), ctrl.create);
router.put('/tables/:id', requireAuth, requireAdmin, validate(schema.update), ctrl.update);

// Đổi trạng thái / bật tắt / đặt giá / sắp xếp
router.patch('/tables/:id/status', requireAuth, requireAdmin, validate(schema.changeStatus), ctrl.changeStatus);
router.patch('/tables/:id/active', requireAuth, requireAdmin, validate(schema.setActive), ctrl.setActive);
router.patch('/tables/:id/rate', requireAuth, requireAdmin, validate(schema.setRate), ctrl.setRate);
router.patch('/tables/reorder', requireAuth, requireAdmin, validate(schema.reorder), ctrl.reorder);

// Xoá bàn
router.delete('/tables/:id', requireAuth, requireAdmin, validate(schema.remove), ctrl.remove);

module.exports = router;
