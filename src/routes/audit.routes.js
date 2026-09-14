const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getAuditLogsByRecord,
  getAuditStats,
} = require('../controllers/audit.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2', 'CHEF'));

router.get('/', getAuditLogs);
router.get('/summary/stats', getAuditStats);
router.get('/record/:recordId', getAuditLogsByRecord);

module.exports = router;
