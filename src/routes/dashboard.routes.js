const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getDashboardSummary,
} = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/auth.middleware');

router.use(authenticate);

// Phase 4 Dashboard Summary API
router.get('/summary', getDashboardSummary);

// Backward compatible stats API
router.get('/stats', getDashboardStats);

module.exports = router;
