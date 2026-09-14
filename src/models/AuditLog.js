const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Record reference is required'],
      index: true,
    },
    module: {
      type: String,
      required: [true, 'Module name is required'],
      enum: {
        values: [
          'SALES',
          'EXPENSE',
          'MOMO_PURCHASE',
          'CASH',
          'CHEF_REQUIREMENT',
          'EMPLOYEE',
          'ATTENDANCE',
          'SALARY_ADVANCE',
          'SALARY',
          'TEMPORARY_STAFF',
          'TEMPORARY_STAFF_WORK',
          'TEMPORARY_STAFF_PAYMENT',
          'SETTING',
          'DAILY_CONTROL',
          'OTHER',
        ],
        message: '{VALUE} is not a valid module name',
      },
      index: true,
    },
    entryCode: {
      type: String,
      trim: true,
      index: true,
      default: '',
    },
    action: {
      type: String,
      enum: {
        values: ['CREATE', 'EDIT', 'DELETE', 'CANCELLED', 'STATUS_CHANGE'],
        message: '{VALUE} is not a valid audit action',
      },
      default: 'EDIT',
      index: true,
    },
    changedFields: {
      type: [String],
      default: [],
    },
    originalValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference (performedBy) is required'],
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ module: 1, timestamp: -1 });
auditLogSchema.index({ recordId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
