const mongoose = require('mongoose');

const additionalCashSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
      default: Date.now,
    },
    amount: {
      type: Number,
      required: [true, 'Additional cash amount is required'],
      min: [1, 'Amount must be greater than zero'],
    },
    reason: {
      type: String,
      required: [true, 'Reason for additional cash is required'],
      trim: true,
      default: 'Additional Working Cash',
    },
    providedBy: {
      type: String,
      required: [true, 'Cash provider / source is required'],
      trim: true,
      default: 'Owner',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference (enteredBy) is required'],
    },
    entryCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'CANCELLED'],
      default: 'ACTIVE',
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    editHistory: [
      {
        previousData: { type: mongoose.Schema.Types.Mixed },
        updatedData: { type: mongoose.Schema.Types.Mixed },
        editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        editedAt: { type: Date, default: Date.now },
        reason: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

additionalCashSchema.index({ date: -1, createdAt: -1 });
additionalCashSchema.index({ enteredBy: 1 });
additionalCashSchema.index({ status: 1 });

module.exports = mongoose.model('AdditionalCash', additionalCashSchema);
