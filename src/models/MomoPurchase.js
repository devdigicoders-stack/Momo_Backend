const mongoose = require('mongoose');

const momoPurchaseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Purchase date is required'],
      default: Date.now,
    },
    momoType: {
      type: String,
      required: [true, 'Momo type is required'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
      min: [0, 'Rate cannot be negative'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    supplierName: {
      type: String,
      trim: true,
      default: '',
    },
    paymentMode: {
      type: String,
      default: 'Cash',
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

// Performance Indexes
momoPurchaseSchema.index({ date: -1, createdAt: -1 });
momoPurchaseSchema.index({ momoType: 1, date: -1 });
momoPurchaseSchema.index({ enteredBy: 1 });

module.exports = mongoose.model('MomoPurchase', momoPurchaseSchema);
