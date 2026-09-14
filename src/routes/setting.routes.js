const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/setting.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

// All authenticated users can view settings
router.get('/', getSettings);

// Only SUPER_ADMIN can update settings
router.put('/', authorize('SUPER_ADMIN'), updateSettings);

module.exports = router;
