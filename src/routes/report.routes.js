const express = require('express');
const router = express.Router();
const { getReportSummary } = require('../controllers/report.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

// Accessible to SUPER_ADMIN, MAIN_MANAGER, and MANAGER_2
router.get(
  '/summary',
  authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'),
  getReportSummary
);

module.exports = router;
