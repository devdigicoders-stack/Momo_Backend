const mongoose = require('mongoose');

const temporaryStaffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Temporary staff name is required'],
      trim: true,
    },
    mobile: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: function (v) {
          if (!v || v.trim() === '') return true;
          return /^[0-9]{10}$/.test(v);
        },
        message: 'Mobile number must be exactly 10 digits',
      },
    },
    photo: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['Active', 'Inactive'],
        message: '{VALUE} is not a valid status',
      },
      default: 'Active',
      index: true,
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

// Auto-generate entry code e.g. TST-0001
temporaryStaffSchema.pre('save', async function (next) {
  if (this.isNew && !this.entryCode) {
    const count = await this.constructor.countDocuments();
    const padded = String(count + 1).padStart(4, '0');
    this.entryCode = `TST-${padded}`;
  }
  next();
});

module.exports = mongoose.model('TemporaryStaff', temporaryStaffSchema);
