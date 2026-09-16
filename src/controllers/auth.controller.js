const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('../models/User');

const generateToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET || 'momos_bhandar_secret_key_super_secure_2026_jwt',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @desc    Login user with Email (or mobile as fallback) & Password
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, mobile, username, password } = req.body;

    const identifier = email || mobile || username;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email/mobile/username and password'
      });
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();

    // Find user by email, mobile, or username
    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier },
        { mobile: cleanIdentifier },
        { username: cleanIdentifier }
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account is deactivated. Please contact Super Admin.'
      });
    }

    // Role validation if role specified
    const requestedRole = req.body.role || req.body.requiredRole;
    if (requestedRole && user.role !== requestedRole) {
      const formatRole = (r) => {
        if (r === 'SUPER_ADMIN') return 'Super Admin';
        if (r === 'MAIN_MANAGER') return 'Main Manager';
        if (r === 'MANAGER_2') return 'Manager 2';
        if (r === 'CHEF') return 'Chef';
        return r.replace('_', ' ');
      };
      return res.status(403).json({
        success: false,
        message: `Unauthorized role: Your account is registered as '${formatRole(user.role)}', not '${formatRole(requestedRole)}'. Please select the '${formatRole(user.role)}' tab.`
      });
    }

    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive,
        profileImage: user.profileImage || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login: ' + error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private (All Roles)
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive,
        profileImage: user.profileImage || null,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Update current logged in user profile (name, mobile, avatar)
// @route   PUT /api/auth/profile
// @access  Private (All Roles)
const updateProfile = async (req, res) => {
  try {
    const { name, mobile } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (name) {
      if (name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Name must be at least 2 characters long'
        });
      }
      user.name = name.trim();
    }

    if (mobile) {
      const cleanMobile = String(mobile).trim();
      if (!/^[0-9]{10}$/.test(cleanMobile)) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number must be exactly 10 digits'
        });
      }
      if (cleanMobile !== user.mobile) {
        const existing = await User.findOne({ mobile: cleanMobile });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: 'This mobile number is already in use by another account'
          });
        }
        user.mobile = cleanMobile;
      }
    }

    if (req.file) {
      user.profileImage = `/uploads/avatars/${req.file.filename}`;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive,
        profileImage: user.profileImage || null,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile: ' + error.message
    });
  }
};

// @desc    Change current logged in user password
// @route   PUT /api/auth/change-password
// @access  Private (All Roles)
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both current password and new password'
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm password do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Save new password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to change password: ' + error.message
    });
  }
};

// @desc    Register or update user FCM Token
// @route   POST /api/auth/fcm-token
// @access  Private
const registerFCMToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'FCM token is required' });
    }

    const userId = req.user._id;

    // Remove token from any other users if device switched
    await User.updateMany(
      { 'fcmTokens.token': token, _id: { $ne: userId } },
      { $pull: { fcmTokens: { token } } }
    );

    // Update current user
    const user = await User.findById(userId);
    const existingIndex = user.fcmTokens.findIndex((t) => t.token === token);

    if (existingIndex > -1) {
      user.fcmTokens[existingIndex].platform = platform || user.fcmTokens[existingIndex].platform;
      user.fcmTokens[existingIndex].updatedAt = new Date();
    } else {
      user.fcmTokens.push({
        token,
        platform: platform || 'android',
        updatedAt: new Date(),
      });
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'FCM Token registered successfully',
    });
  } catch (error) {
    console.error('registerFCMToken error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register FCM token: ' + error.message,
    });
  }
};

// @desc    Remove FCM token on logout
// @route   POST /api/auth/fcm-token/remove
// @access  Private
const removeFCMToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (token) {
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { fcmTokens: { token } },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'FCM Token removed successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to remove FCM token: ' + error.message,
    });
  }
};

module.exports = {
  login,
  getMe,
  updateProfile,
  changePassword,
  registerFCMToken,
  removeFCMToken,
};

