const express = require('express');
const router = express.Router();
const { 
  login, 
  getMe, 
  updateProfile, 
  changePassword,
  registerFCMToken,
  removeFCMToken 
} = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth.middleware');
const { uploadAvatar } = require('../middleware/upload.middleware');

// Public route
router.post('/login', login);

// Private routes (Accessible to ALL authenticated roles)
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, uploadAvatar.single('profileImage'), updateProfile);
router.put('/change-password', authenticate, changePassword);
router.post('/fcm-token', authenticate, registerFCMToken);
router.post('/fcm-token/remove', authenticate, removeFCMToken);

module.exports = router;
