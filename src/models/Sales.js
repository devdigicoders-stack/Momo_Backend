const mongoose = require('mongoose');

const salesSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Sales date is required'],
      default: Date.now,
    },
    amount: {
      type: Number,
      required: [true, 'Total sales amount is required'],
      min: [0.01, 'Sales amount must be greater than 0'],
    },
    paymentMode: {
      type: String,
      required: [true, 'Payment mode is required'],
      enum: {
        values: ['Cash', 'UPI', 'Card', 'Net Banking', 'Canara / Bank', 'Paytm', 'PhonePe', 'Other'],
        message: '{VALUE} is not a supported payment mode',
      },
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
salesSchema.index({ date: -1, createdAt: -1 });
salesSchema.index({ enteredBy: 1 });

module.exports = mongoose.model('Sales', salesSchema);
