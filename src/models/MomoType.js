const mongoose = require('mongoose');

const momoTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Momo type name is required'],
      unique: true,
      trim: true,
    },
    defaultRate: {
      type: Number,
      default: 0,
      min: [0, 'Rate cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MomoType', momoTypeSchema);
