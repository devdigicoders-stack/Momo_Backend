const mongoose = require('mongoose');

const cashDepositSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Deposit date is required'],
      default: Date.now,
    },
    amount: {
      type: Number,
      required: [true, 'Deposit amount is required'],
      min: [1, 'Deposit amount must be greater than zero'],
    },
    bank: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
      default: 'Canara Bank',
    },
    account: {
      type: String,
      required: [true, 'Account number or identifier is required'],
      trim: true,
      default: 'Main Restaurant A/C',
    },
    depositSlip: {
      type: String,
      default: null, // Path to uploaded slip file
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

cashDepositSchema.index({ date: -1, createdAt: -1 });
cashDepositSchema.index({ enteredBy: 1 });
cashDepositSchema.index({ status: 1 });

module.exports = mongoose.model('CashDeposit', cashDepositSchema);
