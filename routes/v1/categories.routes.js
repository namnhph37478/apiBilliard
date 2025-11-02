// routes/v1/categories.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/category.controller');
const schema = require('../../validators/category.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');

// Chỉ admin quản trị danh mục
router.use(requireAuth, requireAdmin);

// List
router.get('/categories', validate(schema.list), ctrl.list);

// Get one
router.get('/categories/:id', validate(schema.getOne), ctrl.getOne);

// Create
router.post('/categories', validate(schema.create), ctrl.create);

// Update
router.put('/categories/:id', validate(schema.update), ctrl.update);

// Toggle active
router.patch('/categories/:id/active', validate(schema.setActive), ctrl.setActive);

// Delete
router.delete('/categories/:id', validate(schema.remove), ctrl.remove);

module.exports = router;
