const express = require('express');
const router = express.Router();
const { getNotifications, markAllAsRead, sendTestNotification } = require('../controllers/notification.controller');
const authenticate = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', getNotifications);
router.post('/mark-read', markAllAsRead);
router.post('/test', sendTestNotification);

module.exports = router;
