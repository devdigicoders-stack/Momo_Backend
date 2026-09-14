const express = require('express');
const router = express.Router();
const { getHistory } = require('../controllers/history.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2', 'CHEF'));

router.get('/', getHistory);

module.exports = router;
