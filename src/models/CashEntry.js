const mongoose = require('mongoose');

const cashEntrySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Cash date is required'],
      default: Date.now,
    },
    openingCash: {
      type: Number,
      required: [true, 'Opening cash is required'],
      min: [0, 'Opening cash cannot be negative'],
    },
    cashReceived: {
      type: Number,
      required: [true, 'Cash received is required'],
      min: [0, 'Cash received cannot be negative'],
      default: 0,
    },
    cashPaid: {
      type: Number,
      required: [true, 'Cash paid is required'],
      min: [0, 'Cash paid cannot be negative'],
      default: 0,
    },
    closingCash: {
      type: Number,
      required: [true, 'Closing cash is required'],
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
cashEntrySchema.index({ date: -1, createdAt: -1 });
cashEntrySchema.index({ enteredBy: 1 });

module.exports = mongoose.model('CashEntry', cashEntrySchema);
