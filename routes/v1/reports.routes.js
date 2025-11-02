// routes/v1/reports.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/report.controller');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

// Nhân viên & quản lý đều có quyền xem báo cáo
router.use(requireAuth, requireRole(['staff', 'admin']));

// Tổng quan theo khoảng thời gian
router.get('/reports/summary', ctrl.summary);

// Báo cáo theo ngày (1 ngày cụ thể)
router.get('/reports/daily', ctrl.daily);

// Chuỗi doanh thu (groupBy=day|month)
router.get('/reports/revenue', ctrl.revenue);

// Top sản phẩm (theo qty|amount)
router.get('/reports/top-products', ctrl.topProducts);

// Top bàn (theo minutes|amount)
router.get('/reports/top-tables', ctrl.topTables);

// Hiệu suất theo nhân viên
router.get('/reports/staff', ctrl.byStaff);

// Snapshot dashboard hôm nay
router.get('/reports/dashboard', ctrl.dashboard);

module.exports = router;
