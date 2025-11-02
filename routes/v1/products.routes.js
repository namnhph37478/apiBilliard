// routes/v1/products.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/product.controller');
const schema = require('../../validators/product.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole, requireAdmin } = require('../../middlewares/role.middleware');

// Nhân viên & quản lý có thể xem danh sách / chi tiết
router.get('/products', requireAuth, requireRole(['staff', 'admin']), validate(schema.list), ctrl.list);
router.get('/products/:id', requireAuth, requireRole(['staff', 'admin']), validate(schema.getOne), ctrl.getOne);

// Quản trị CRUD & tác vụ nâng cao
router.post('/products', requireAuth, requireAdmin, validate(schema.create), ctrl.create);
router.put('/products/:id', requireAuth, requireAdmin, validate(schema.update), ctrl.update);

router.patch('/products/:id/active', requireAuth, requireAdmin, validate(schema.setActive), ctrl.setActive);
router.patch('/products/:id/price', requireAuth, requireAdmin, validate(schema.setPrice), ctrl.setPrice);
router.patch('/products/:id/images', requireAuth, requireAdmin, validate(schema.setImages), ctrl.setImages);

router.patch('/products/:id/tags/add', requireAuth, requireAdmin, validate(schema.addTags), ctrl.addTags);
router.patch('/products/:id/tags/remove', requireAuth, requireAdmin, validate(schema.removeTags), ctrl.removeTags);

router.delete('/products/:id', requireAuth, requireAdmin, validate(schema.remove), ctrl.remove);

module.exports = router;
