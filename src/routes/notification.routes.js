const express = require('express');
const router = express.Router();
const { getNotifications, markAllAsRead } = require('../controllers/notification.controller');
const authenticate = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', getNotifications);
router.post('/mark-read', markAllAsRead);

module.exports = router;
