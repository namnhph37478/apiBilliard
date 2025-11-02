// routes/v1/auth.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/auth.controller');
const schema = require('../../validators/auth.schema');

const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth, verifyRefresh } = require('../../middlewares/auth.middleware');

// ---- Public auth endpoints ----
router.post('/auth/login', validate(schema.login), ctrl.login);
router.post('/auth/refresh', validate(schema.refresh), verifyRefresh, ctrl.refresh);
router.post('/auth/logout', ctrl.logout);

// ---- Authenticated profile endpoints ----
router.get('/auth/me', requireAuth, ctrl.me);
router.put('/auth/profile', requireAuth, validate(schema.updateProfile), ctrl.updateProfile);
router.put('/auth/change-password', requireAuth, validate(schema.changePassword), ctrl.changePassword);

module.exports = router;
