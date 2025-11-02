// routes/v1/users.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user.controller');
const schema = require('../../validators/user.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');

// Chỉ admin được quản trị người dùng
router.use(requireAuth, requireAdmin);

// List users
router.get('/users', validate(schema.list), ctrl.list);

// Get one
router.get('/users/:id', validate(schema.getOne), ctrl.getOne);

// Create
router.post('/users', validate(schema.create), ctrl.create);

// Update
router.put('/users/:id', validate(schema.update), ctrl.update);

// Change role
router.patch('/users/:id/role', validate(schema.changeRole), ctrl.changeRole);

// Set active
router.patch('/users/:id/active', validate(schema.setActive), ctrl.setActive);

// Reset password
router.patch('/users/:id/reset-password', validate(schema.resetPassword), ctrl.resetPassword);

// Delete
router.delete('/users/:id', validate(schema.remove), ctrl.remove);

module.exports = router;
