const express = require('express');
const { Account, Transaction } = require('../models');
const { validate } = require('../middleware/validate');
const { HttpError } = require('../middleware/error');
const { findOwned } = require('../services/ownership');
const { withBalances } = require('../services/balances');
const { z, color, icon, patchOf } = require('../services/schemas');

const router = express.Router();

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  type: z.enum(['cash', 'bank', 'card', 'wallet', 'savings']).default('cash'),
  icon: icon.default('wallet'),
  color: color.default('#6366F1'),
  openingBalance: z.coerce.number().default(0),
  archived: z.boolean().default(false),
});

router.get('/', async (req, res) => {
  const filter = { userId: req.userId };
  if (req.query.includeArchived !== 'true') filter.archived = false;
  const accounts = await Account.find(filter).sort({ createdAt: 1 });
  const items = await withBalances(req.userId, accounts);
  const totalBalance = items.filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0);
  res.json({ items, totalBalance: Math.round(totalBalance * 100) / 100 });
});

router.get('/:id', async (req, res) => {
  const account = await findOwned(Account, req.params.id, req.userId, 'Account');
  const [item] = await withBalances(req.userId, [account]);
  res.json(item);
});

router.post('/', validate(accountSchema), async (req, res) => {
  const account = await Account.create({ ...req.body, userId: req.userId });
  const [item] = await withBalances(req.userId, [account]);
  res.status(201).json(item);
});

router.patch('/:id', validate(patchOf(accountSchema)), async (req, res) => {
  const account = await findOwned(Account, req.params.id, req.userId, 'Account');
  account.set(req.body);
  await account.save();
  const [item] = await withBalances(req.userId, [account]);
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  const account = await findOwned(Account, req.params.id, req.userId, 'Account');
  const used = await Transaction.exists({
    userId: req.userId,
    $or: [{ accountId: account._id }, { toAccountId: account._id }],
  });
  if (used && req.query.force !== 'true') {
    throw new HttpError(409, 'Account has transactions. Archive it instead, or delete with force=true to remove its transactions too.');
  }
  await Transaction.deleteMany({ userId: req.userId, $or: [{ accountId: account._id }, { toAccountId: account._id }] });
  await account.deleteOne();
  res.status(204).end();
});

module.exports = router;
