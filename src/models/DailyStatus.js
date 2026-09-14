const mongoose = require('mongoose');

const dailyStatusSchema = new mongoose.Schema(
  {
    date: {
      type: String, // Format: 'YYYY-MM-DD'
      required: [true, 'Date string (YYYY-MM-DD) is required'],
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['OPEN', 'COMPLETED', 'LOCKED'],
        message: '{VALUE} is not a valid daily status',
      },
      default: 'OPEN',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('DailyStatus', dailyStatusSchema);
