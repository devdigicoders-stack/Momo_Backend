const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Expense date is required'],
      default: Date.now,
    },
    category: {
      type: String,
      required: [true, 'Expense category is required'],
      trim: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: '',
    },
    item: {
      type: String,
      required: [true, 'Item or description is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Expense amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    paymentMode: {
      type: String,
      required: [true, 'Payment mode is required'],
      enum: {
        values: ['Cash', 'UPI', 'Card', 'Net Banking', 'Canara / Bank', 'Paytm', 'PhonePe', 'Other'],
        message: '{VALUE} is not a valid payment mode',
      },
      default: 'Cash',
    },
    bill: {
      type: String, // Store file upload path or URL
      default: null,
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
expenseSchema.index({ date: -1, createdAt: -1 });
expenseSchema.index({ category: 1, date: -1 });
expenseSchema.index({ enteredBy: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
