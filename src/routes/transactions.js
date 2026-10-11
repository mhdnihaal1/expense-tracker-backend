const express = require('express');
const { Transaction, Category } = require('../models');
const { validate } = require('../middleware/validate');
const { findOwned } = require('../services/ownership');
const { transactionShape, checkTransactionRefs } = require('../services/transactionRules');
const { z, objectId, patchOf } = require('../services/schemas');

const router = express.Router();

const transactionSchema = z.object({
  ...transactionShape,
  date: z.coerce.date().default(() => new Date()),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z.enum(['expense', 'income', 'transfer']).optional(),
  accountId: objectId.optional(),
  categoryId: objectId.optional(),
  q: z.string().trim().max(100).optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(30),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const populate = [
  { path: 'categoryId', select: 'name icon color type' },
  { path: 'accountId', select: 'name icon color type' },
  { path: 'toAccountId', select: 'name icon color type' },
];

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { from, to, type, accountId, categoryId, q, minAmount, maxAmount, page, limit } = req.validQuery;
  const filter = { userId: req.userId };
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (type) filter.type = type;
  if (accountId) filter.$and = [{ $or: [{ accountId }, { toAccountId: accountId }] }];
  if (categoryId) filter.categoryId = categoryId;
  if (minAmount != null || maxAmount != null) {
    filter.amount = { ...(minAmount != null && { $gte: minAmount }), ...(maxAmount != null && { $lte: maxAmount }) };
  }
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const matchingCats = await Category.find({ userId: req.userId, name: rx }).select('_id');
    (filter.$and ||= []).push({
      $or: [{ note: rx }, { tags: rx }, { categoryId: { $in: matchingCats.map((c) => c._id) } }],
    });
  }

  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate(populate),
    Transaction.countDocuments(filter),
  ]);
  res.json({ items, page, limit, total, hasMore: page * limit < total });
});

router.get('/tags', async (req, res) => {
  const tags = await Transaction.distinct('tags', { userId: req.userId });
  res.json({ items: tags.sort() });
});

router.get('/:id', async (req, res) => {
  const tx = await findOwned(Transaction, req.params.id, req.userId, 'Transaction');
  await tx.populate(populate);
  res.json(tx);
});

router.post('/', validate(transactionSchema), async (req, res) => {
  const data = await checkTransactionRefs(req.userId, { ...req.body });
  const tx = await Transaction.create({ ...data, userId: req.userId });
  await tx.populate(populate);
  res.status(201).json(tx);
});

router.patch('/:id', validate(patchOf(transactionSchema)), async (req, res) => {
  const tx = await findOwned(Transaction, req.params.id, req.userId, 'Transaction');
  const merged = {
    type: tx.type, amount: tx.amount, accountId: String(tx.accountId),
    toAccountId: tx.toAccountId && String(tx.toAccountId), categoryId: tx.categoryId && String(tx.categoryId),
    note: tx.note, date: tx.date, tags: tx.tags,
    ...req.body,
  };
  const data = await checkTransactionRefs(req.userId, merged);
  tx.set(data);
  await tx.save();
  await tx.populate(populate);
  res.json(tx);
});

router.delete('/:id', async (req, res) => {
  const tx = await findOwned(Transaction, req.params.id, req.userId, 'Transaction');
  await tx.deleteOne();
  res.status(204).end();
});

module.exports = router;
