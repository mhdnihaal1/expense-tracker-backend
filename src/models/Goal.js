const { Schema, model } = require('mongoose');

const goalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0.01 },
    savedAmount: { type: Number, default: 0 },
    deadline: { type: Date, default: null },
    icon: { type: String, default: 'flag' },
    color: { type: String, default: '#10B981' },
    contributions: {
      type: [{ amount: Number, date: { type: Date, default: Date.now }, note: String }],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = model('Goal', goalSchema);
