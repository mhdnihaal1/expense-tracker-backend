const { Schema, model } = require('mongoose');

// A monthly spending limit. categoryId null = overall budget across all expenses.
const budgetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    amount: { type: Number, required: true, min: 0.01 },
    alertThreshold: { type: Number, default: 80, min: 1, max: 100 },
  },
  { timestamps: true }
);

budgetSchema.index({ userId: 1, categoryId: 1 }, { unique: true });

module.exports = model('Budget', budgetSchema);
