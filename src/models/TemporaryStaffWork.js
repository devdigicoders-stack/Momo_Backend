const mongoose = require('mongoose');

const temporaryStaffWorkSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TemporaryStaff',
      required: [true, 'Temporary staff reference is required'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Worked date is required'],
      index: true,
    },
    dailyWage: {
      type: Number,
      required: [true, 'Daily wage is required'],
      min: [0.01, 'Daily wage must be greater than 0'],
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

// Compound Unique Index: Ensure same temporary staff cannot have duplicate work record on same date
temporaryStaffWorkSchema.index({ staff: 1, date: 1 }, { unique: true });
temporaryStaffWorkSchema.index({ date: -1 });

// Auto-generate entry code e.g. TWR-0001
temporaryStaffWorkSchema.pre('save', async function (next) {
  if (this.isNew && !this.entryCode) {
    const count = await this.constructor.countDocuments();
    const padded = String(count + 1).padStart(4, '0');
    this.entryCode = `TWR-${padded}`;
  }
  next();
});

module.exports = mongoose.model('TemporaryStaffWork', temporaryStaffWorkSchema);
