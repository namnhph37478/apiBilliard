// routes/v1/table-types.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/table-type.controller');
const schema = require('../../validators/table-type.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');

// Chỉ admin được quản trị loại bàn
router.use(requireAuth, requireAdmin);

// List
router.get('/table-types', validate(schema.list), ctrl.list);

// Get one
router.get('/table-types/:id', validate(schema.getOne), ctrl.getOne);

// Create
router.post('/table-types', validate(schema.create), ctrl.create);

// Update
router.put('/table-types/:id', validate(schema.update), ctrl.update);

// Toggle active
router.patch('/table-types/:id/active', validate(schema.setActive), ctrl.setActive);

// Replace day rates
router.patch('/table-types/:id/day-rates', validate(schema.setDayRates), ctrl.setDayRates);

// Delete
router.delete('/table-types/:id', validate(schema.remove), ctrl.remove);

module.exports = router;
