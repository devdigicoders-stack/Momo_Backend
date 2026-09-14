const MomoType = require('../models/MomoType');

// @desc    Get all Momo Types
// @route   GET /api/momo-types
// @access  Private
exports.getAllMomoTypes = async (req, res) => {
  try {
    const types = await MomoType.find().sort({ name: 1 });
    return res.status(200).json({
      success: true,
      count: types.length,
      data: types,
    });
  } catch (error) {
    console.error('Get momo types error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching momo types',
    });
  }
};

// @desc    Create new Momo Type
// @route   POST /api/momo-types
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.createMomoType = async (req, res) => {
  try {
    const { name, defaultRate } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Momo type name is required',
      });
    }

    const existingType = await MomoType.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });

    if (existingType) {
      return res.status(400).json({
        success: false,
        message: `Momo type "${name}" already exists`,
      });
    }

    const momoType = await MomoType.create({
      name: name.trim(),
      defaultRate: defaultRate !== undefined ? Math.max(0, Number(defaultRate)) : 0,
      enteredBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Momo type created successfully',
      data: momoType,
    });
  } catch (error) {
    console.error('Create momo type error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating momo type',
    });
  }
};

// @desc    Update Momo Type
// @route   PUT /api/momo-types/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.updateMomoType = async (req, res) => {
  try {
    const { name, defaultRate, isActive } = req.body;

    const momoType = await MomoType.findById(req.params.id);
    if (!momoType) {
      return res.status(404).json({
        success: false,
        message: 'Momo type not found',
      });
    }

    if (name && name.trim()) momoType.name = name.trim();
    if (defaultRate !== undefined) momoType.defaultRate = Math.max(0, Number(defaultRate));
    if (isActive !== undefined) momoType.isActive = Boolean(isActive);

    await momoType.save();

    return res.status(200).json({
      success: true,
      message: 'Momo type updated successfully',
      data: momoType,
    });
  } catch (error) {
    console.error('Update momo type error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating momo type',
    });
  }
};

// @desc    Toggle Momo Type status
// @route   PATCH /api/momo-types/:id/status
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.toggleMomoTypeStatus = async (req, res) => {
  try {
    const momoType = await MomoType.findById(req.params.id);
    if (!momoType) {
      return res.status(404).json({
        success: false,
        message: 'Momo type not found',
      });
    }

    momoType.isActive = !momoType.isActive;
    await momoType.save();

    return res.status(200).json({
      success: true,
      message: `Momo type marked as ${momoType.isActive ? 'Active' : 'Inactive'}`,
      data: momoType,
    });
  } catch (error) {
    console.error('Toggle momo type status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while toggling momo type status',
    });
  }
};
