const mongoose = require('mongoose');

const temporaryStaffPaymentSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TemporaryStaff',
      required: [true, 'Temporary staff reference is required'],
      index: true,
    },
    paymentMonth: {
      type: String, // 'YYYY-MM', e.g. '2026-09'
      trim: true,
      index: true,
      default: '',
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    daysWorked: {
      type: Number,
      default: 0,
      min: [0, 'Days worked cannot be negative'],
    },
    payableAmount: {
      type: Number,
      required: [true, 'Payable amount is required'],
      min: [0, 'Payable amount cannot be negative'],
    },
    paidAmount: {
      type: Number,
      required: [true, 'Paid amount is required'],
      min: [0.01, 'Paid amount must be greater than 0'],
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
      enum: {
        values: ['Pending', 'Partially Paid', 'Paid'],
        message: '{VALUE} is not a valid payment status',
      },
      default: 'Paid',
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

temporaryStaffPaymentSchema.index({ paymentDate: -1 });

// Auto-generate entry code e.g. TPM-0001
temporaryStaffPaymentSchema.pre('save', async function (next) {
  if (this.isNew && !this.entryCode) {
    const count = await this.constructor.countDocuments();
    const padded = String(count + 1).padStart(4, '0');
    this.entryCode = `TPM-${padded}`;
  }
  next();
});

module.exports = mongoose.model('TemporaryStaffPayment', temporaryStaffPaymentSchema);
