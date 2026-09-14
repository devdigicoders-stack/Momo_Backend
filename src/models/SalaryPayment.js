const mongoose = require('mongoose');

const salaryPaymentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee reference is required'],
      index: true,
    },
    salaryMonth: {
      type: String, // Format: 'YYYY-MM', e.g. '2026-09'
      required: [true, 'Salary month is required'],
      trim: true,
      index: true,
    },
    monthlySalary: {
      type: Number,
      required: [true, 'Base monthly salary is required'],
      min: [0, 'Monthly salary cannot be negative'],
    },
    absentDays: {
      type: Number,
      default: 0,
      min: [0, 'Absent days cannot be negative'],
    },
    absentDeduction: {
      type: Number,
      default: 0,
      min: [0, 'Absent deduction cannot be negative'],
    },
    advanceDeduction: {
      type: Number,
      default: 0,
      min: [0, 'Advance deduction cannot be negative'],
    },
    paidAmount: {
      type: Number,
      required: [true, 'Paid amount is required'],
      min: [0, 'Paid amount cannot be negative'],
    },
    paymentDate: {
      type: Date,
      required: [true, 'Payment date is required'],
      default: Date.now,
      index: true,
    },
    paymentMode: {
      type: String,
      enum: {
        values: ['Cash', 'UPI', 'Bank Transfer', 'Cheque'],
        message: '{VALUE} is not a valid payment mode',
      },
      default: 'Cash',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference (paidBy) is required'],
    },
    status: {
      type: String,
      enum: ['PAID', 'PENDING'],
      default: 'PAID',
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

// Compound Unique Index: Prevent duplicate salary payments for same employee in the same month
salaryPaymentSchema.index({ employee: 1, salaryMonth: 1 }, { unique: true });
salaryPaymentSchema.index({ paymentDate: -1 });

module.exports = mongoose.model('SalaryPayment', salaryPaymentSchema);
