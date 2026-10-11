const { Schema, model } = require('mongoose');

const accountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['cash', 'bank', 'card', 'wallet', 'savings'], default: 'cash' },
    icon: { type: String, default: 'wallet' },
    color: { type: String, default: '#6366F1' },
    openingBalance: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('Account', accountSchema);
