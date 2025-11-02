// routes/v1/promotions.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/promotion.controller');
const schema = require('../../validators/promotion.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');

// Chỉ admin quản trị khuyến mãi
router.use(requireAuth, requireAdmin);

// List
router.get('/promotions', validate(schema.list), ctrl.list);

// Get one
router.get('/promotions/:id', validate(schema.getOne), ctrl.getOne);

// Create
router.post('/promotions', validate(schema.create), ctrl.create);

// Update
router.put('/promotions/:id', validate(schema.update), ctrl.update);

// Toggle active
router.patch('/promotions/:id/active', validate(schema.setActive), ctrl.setActive);

// Set apply order
router.patch('/promotions/:id/apply-order', validate(schema.setApplyOrder), ctrl.setApplyOrder);

// Delete
router.delete('/promotions/:id', validate(schema.remove), ctrl.remove);

module.exports = router;
