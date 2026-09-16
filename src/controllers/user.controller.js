const bcrypt = require('bcryptjs');
const { User, ROLES } = require('../models/User');

// @desc    Get all users (Super Admin only)
// @route   GET /api/users
// @access  Private / SUPER_ADMIN
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users: ' + error.message
    });
  }
};

// @desc    Get single user by ID
// @route   GET /api/users/:id
// @access  Private / SUPER_ADMIN
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user: ' + error.message
    });
  }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private / SUPER_ADMIN
const createUser = async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;

    if (!name || !email || !mobile || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, mobile, password, and role'
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanMobile = String(mobile).trim();

    if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    if (!/^[0-9]{10}$/.test(cleanMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be exactly 10 digits'
      });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${ROLES.join(', ')}`
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check duplicate email
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address already exists'
      });
    }

    // Check duplicate mobile
    const existingMobile = await User.findOne({ mobile: cleanMobile });
    if (existingMobile) {
      return res.status(409).json({
        success: false,
        message: 'A user with this mobile number already exists'
      });
    }

    const user = new User({
      name: name.trim(),
      email: cleanEmail,
      mobile: cleanMobile,
      password,
      role,
      isActive: true
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create user: ' + error.message
    });
  }
};

// @desc    Update user details (name, email, mobile, role, password optionally)
// @route   PUT /api/users/:id
// @access  Private / SUPER_ADMIN
const updateUser = async (req, res) => {
  try {
    const { name, email, mobile, role, password, isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (name) user.name = name.trim();

    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }
      if (cleanEmail !== user.email) {
        const duplicateEmail = await User.findOne({ email: cleanEmail });
        if (duplicateEmail) {
          return res.status(409).json({
            success: false,
            message: 'Email address is already in use by another user'
          });
        }
        user.email = cleanEmail;
      }
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
        const duplicate = await User.findOne({ mobile: cleanMobile });
        if (duplicate) {
          return res.status(409).json({
            success: false,
            message: 'Mobile number is already in use by another user'
          });
        }
        user.mobile = cleanMobile;
      }
    }

    if (role) {
      if (!ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Allowed roles: ${ROLES.join(', ')}`
        });
      }
      user.role = role;
    }

    if (typeof isActive === 'boolean') {
      user.isActive = isActive;
    }

    if (password && String(password).trim() !== '') {
      const cleanPassword = String(password).trim();
      if (cleanPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }
      user.password = cleanPassword;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update user: ' + error.message
    });
  }
};

// @desc    Toggle user status (Active / Deactive)
// @route   PATCH /api/users/:id/status
// @access  Private / SUPER_ADMIN
const toggleUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent Super Admin from deactivating self
    if (req.user._id.toString() === user._id.toString() && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own Super Admin account'
      });
    }

    user.isActive = typeof isActive === 'boolean' ? isActive : !user.isActive;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update user status: ' + error.message
    });
  }
};

// @desc    Soft Delete / Deactivate user
// @route   DELETE /api/users/:id
// @access  Private / SUPER_ADMIN
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (req.user._id.toString() === user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own Super Admin account'
      });
    }

    user.isActive = false;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User deactivated successfully (preserved for business audit history)',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete/deactivate user: ' + error.message
    });
  }
};

// @desc    Change user role
// @route   PATCH /api/users/:id/role
// @access  Private / SUPER_ADMIN
const changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!role || !ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${ROLES.join(', ')}`
      });
    }

    // Prevent Super Admin from demoting self if they are the only active Super Admin
    if (req.user._id.toString() === user._id.toString() && role !== 'SUPER_ADMIN') {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own Super Admin role'
      });
    }

    user.role = role;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User role changed to ${role} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to change user role: ' + error.message
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  changeUserRole,
  deleteUser
};
