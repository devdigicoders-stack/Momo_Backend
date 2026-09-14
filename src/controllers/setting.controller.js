const RestaurantSetting = require('../models/RestaurantSetting');

// @desc    Get restaurant settings (or initialize default if none exists)
// @route   GET /api/settings
// @access  Private (All authenticated users can view settings)
exports.getSettings = async (req, res) => {
  try {
    let settings = await RestaurantSetting.findOne().populate('updatedBy', 'name email role');

    if (!settings) {
      settings = await RestaurantSetting.create({
        restaurantName: 'Momos Bhandar',
        tagline: 'Authentic Taste & Quality Delicacies',
        phone: '+91 9876543210',
        email: 'info@momosbhandar.com',
        address: 'Shop No. 12, Food Street, Main Market, City Centre',
        gstNumber: '09AAACH7409R1ZZ',
        fssaiNumber: '12724055000123',
        currencySymbol: '₹',
        currencyCode: 'INR',
        openingTime: '11:00 AM',
        closingTime: '11:00 PM',
        defaultPaymentMode: 'UPI',
        billFooterNote: 'Thank you for dining with Momos Bhandar! Visit Again.',
        updatedBy: req.user._id,
      });
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching system settings',
    });
  }
};

// @desc    Update restaurant settings
// @route   PUT /api/settings
// @access  Private (SUPER_ADMIN only)
exports.updateSettings = async (req, res) => {
  try {
    const {
      restaurantName,
      tagline,
      phone,
      email,
      address,
      gstNumber,
      fssaiNumber,
      currencySymbol,
      currencyCode,
      openingTime,
      closingTime,
      defaultPaymentMode,
      billFooterNote,
    } = req.body;

    let settings = await RestaurantSetting.findOne();

    if (!settings) {
      settings = new RestaurantSetting();
    }

    if (restaurantName !== undefined) settings.restaurantName = restaurantName;
    if (tagline !== undefined) settings.tagline = tagline;
    if (phone !== undefined) settings.phone = phone;
    if (email !== undefined) settings.email = email;
    if (address !== undefined) settings.address = address;
    if (gstNumber !== undefined) settings.gstNumber = gstNumber;
    if (fssaiNumber !== undefined) settings.fssaiNumber = fssaiNumber;
    if (currencySymbol !== undefined) settings.currencySymbol = currencySymbol;
    if (currencyCode !== undefined) settings.currencyCode = currencyCode;
    if (openingTime !== undefined) settings.openingTime = openingTime;
    if (closingTime !== undefined) settings.closingTime = closingTime;
    if (defaultPaymentMode !== undefined) settings.defaultPaymentMode = defaultPaymentMode;
    if (billFooterNote !== undefined) settings.billFooterNote = billFooterNote;
    settings.updatedBy = req.user._id;

    await settings.save();

    const populatedSettings = await RestaurantSetting.findById(settings._id).populate(
      'updatedBy',
      'name email role'
    );

    return res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      data: populatedSettings,
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating system settings',
    });
  }
};
