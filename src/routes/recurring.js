const express = require('express');
const { Recurring } = require('../models');
const { validate } = require('../middleware/validate');
const { findOwned } = require('../services/ownership');
const { processDue } = require('../services/recurring');
const { transactionShape, checkTransactionRefs } = require('../services/transactionRules');
const { z, patchOf } = require('../services/schemas');
const { addPeriod } = require('../services/dates');

const router = express.Router();

const recurringSchema = z.object({
  ...transactionShape,
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  startDate: z.coerce.date().default(() => new Date()),
  endDate: z.coerce.date().nullable().default(null),
});

const populate = [
  { path: 'categoryId', select: 'name icon color type' },
  { path: 'accountId', select: 'name icon color' },
  { path: 'toAccountId', select: 'name icon color' },
];

router.get('/', async (req, res) => {
  const items = await Recurring.find({ userId: req.userId }).sort({ active: -1, nextRunDate: 1 }).populate(populate);
  res.json({ items });
});

router.post('/', validate(recurringSchema), async (req, res) => {
  const data = await checkTransactionRefs(req.userId, { ...req.body });
  const rule = await Recurring.create({ ...data, userId: req.userId, nextRunDate: data.startDate });
  await processDue({ userId: req.userId });
  const fresh = await Recurring.findById(rule._id).populate(populate);
  res.status(201).json(fresh);
});

router.patch('/:id', validate(patchOf(recurringSchema)), async (req, res) => {
  const rule = await findOwned(Recurring, req.params.id, req.userId, 'Recurring rule');
  const merged = {
    type: rule.type, amount: rule.amount, accountId: String(rule.accountId),
    toAccountId: rule.toAccountId && String(rule.toAccountId), categoryId: rule.categoryId && String(rule.categoryId),
    note: rule.note, frequency: rule.frequency, startDate: rule.startDate, endDate: rule.endDate,
    ...req.body,
  };
  const data = await checkTransactionRefs(req.userId, merged);
  // Changing the start date reschedules the next run from the new start.
  if (req.body.startDate) data.nextRunDate = req.body.startDate;
  rule.set(data);
  await rule.save();
  await processDue({ userId: req.userId });
  res.json(await Recurring.findById(rule._id).populate(populate));
});

router.post('/:id/toggle', async (req, res) => {
  const rule = await findOwned(Recurring, req.params.id, req.userId, 'Recurring rule');
  rule.active = !rule.active;
  // On resume, skip occurrences missed while paused instead of back-filling them.
  if (rule.active && rule.nextRunDate < new Date()) {
    const anchor = rule.startDate.getUTCDate();
    let next = rule.nextRunDate;
    while (next < new Date()) next = addPeriod(next, rule.frequency, anchor);
    rule.nextRunDate = next;
  }
  await rule.save();
  res.json(await Recurring.findById(rule._id).populate(populate));
});

router.delete('/:id', async (req, res) => {
  const rule = await findOwned(Recurring, req.params.id, req.userId, 'Recurring rule');
  await rule.deleteOne();
  res.status(204).end();
});

module.exports = router;
