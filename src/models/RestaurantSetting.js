const mongoose = require('mongoose');

const restaurantSettingSchema = new mongoose.Schema(
  {
    restaurantName: {
      type: String,
      required: true,
      default: 'Momos Bhandar',
      trim: true,
    },
    tagline: {
      type: String,
      default: 'Authentic Taste & Quality Delicacies',
      trim: true,
    },
    phone: {
      type: String,
      default: '+91 9876543210',
      trim: true,
    },
    email: {
      type: String,
      default: 'info@momosbhandar.com',
      trim: true,
    },
    address: {
      type: String,
      default: 'Shop No. 12, Food Street, Main Market, City Centre',
      trim: true,
    },
    gstNumber: {
      type: String,
      default: '09AAACH7409R1ZZ',
      trim: true,
    },
    fssaiNumber: {
      type: String,
      default: '12724055000123',
      trim: true,
    },
    currencySymbol: {
      type: String,
      default: '₹',
      trim: true,
    },
    currencyCode: {
      type: String,
      default: 'INR',
      trim: true,
    },
    openingTime: {
      type: String,
      default: '11:00 AM',
      trim: true,
    },
    closingTime: {
      type: String,
      default: '11:00 PM',
      trim: true,
    },
    defaultPaymentMode: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Net Banking'],
      default: 'UPI',
    },
    billFooterNote: {
      type: String,
      default: 'Thank you for dining with Momos Bhandar! Visit Again.',
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('RestaurantSetting', restaurantSettingSchema);
