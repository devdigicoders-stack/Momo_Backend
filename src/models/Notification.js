const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'success', 'lock', 'status', 'danger'],
      default: 'info',
    },
    category: {
      type: String,
      enum: ['CHEF_REQUIREMENT', 'DAMAGE_REPORT', 'PURCHASE', 'EXPENSE', 'SALES', 'SYSTEM', 'LOCK'],
      default: 'SYSTEM',
    },
    targetRoles: {
      type: [String],
      default: ['SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2', 'CHEF'],
    },
    targetUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    referenceId: {
      type: String,
      default: '',
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ targetUsers: 1 });
notificationSchema.index({ targetRoles: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
