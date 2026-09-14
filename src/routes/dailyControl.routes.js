const express = require('express');
const router = express.Router();
const {
  getDailyStatusAndChecklist,
  toggleDailyStatus,
  toggleDateLock,
  getMyRecentEntries,
} = require('../controllers/dailyControl.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

router.get('/status', getDailyStatusAndChecklist);
router.post('/toggle-status', authorize('SUPER_ADMIN', 'MAIN_MANAGER'), toggleDailyStatus);
router.post('/toggle-lock', authorize('SUPER_ADMIN'), toggleDateLock);
router.get('/my-recent-entries', getMyRecentEntries);

module.exports = router;
