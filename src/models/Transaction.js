const { Schema, model } = require('mongoose');

const round2 = (v) => Math.round(v * 100) / 100;

const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['expense', 'income', 'transfer'], required: true },
    amount: { type: Number, required: true, min: 0.01, set: round2 },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    toAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    date: { type: Date, required: true, default: Date.now },
    note: { type: String, default: '', trim: true },
    tags: { type: [String], default: [] },
    recurringId: { type: Schema.Types.ObjectId, ref: 'Recurring', default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, categoryId: 1 });
transactionSchema.index({ userId: 1, accountId: 1 });

module.exports = model('Transaction', transactionSchema);
