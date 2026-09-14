const express = require('express');
const router = express.Router();
const { login, getMe, updateProfile, changePassword } = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth.middleware');

// Public route
router.post('/login', login);

// Private routes (Accessible to ALL authenticated roles)
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);

module.exports = router;
