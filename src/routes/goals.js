const express = require('express');
const { Goal } = require('../models');
const { validate } = require('../middleware/validate');
const { HttpError } = require('../middleware/error');
const { findOwned } = require('../services/ownership');
const { z, money, color, icon, patchOf } = require('../services/schemas');

const router = express.Router();

const goalSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  targetAmount: money,
  deadline: z.coerce.date().nullable().default(null),
  icon: icon.default('flag'),
  color: color.default('#10B981'),
});

router.get('/', async (req, res) => {
  const items = await Goal.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ items });
});

router.get('/:id', async (req, res) => {
  res.json(await findOwned(Goal, req.params.id, req.userId, 'Goal'));
});

router.post('/', validate(goalSchema), async (req, res) => {
  const goal = await Goal.create({ ...req.body, userId: req.userId });
  res.status(201).json(goal);
});

router.patch('/:id', validate(patchOf(goalSchema)), async (req, res) => {
  const goal = await findOwned(Goal, req.params.id, req.userId, 'Goal');
  goal.set(req.body);
  await goal.save();
  res.json(goal);
});

// Positive amount adds savings; negative withdraws (never below zero).
const contributeSchema = z.object({
  amount: z.coerce.number().refine((n) => n !== 0, 'Amount cannot be zero'),
  note: z.string().trim().max(120).default(''),
  date: z.coerce.date().default(() => new Date()),
});

router.post('/:id/contribute', validate(contributeSchema), async (req, res) => {
  const goal = await findOwned(Goal, req.params.id, req.userId, 'Goal');
  const next = Math.round((goal.savedAmount + req.body.amount) * 100) / 100;
  if (next < 0) throw new HttpError(400, 'Cannot withdraw more than saved', { amount: 'Exceeds saved amount' });
  goal.savedAmount = next;
  goal.contributions.push(req.body);
  await goal.save();
  res.json(goal);
});

router.delete('/:id', async (req, res) => {
  const goal = await findOwned(Goal, req.params.id, req.userId, 'Goal');
  await goal.deleteOne();
  res.status(204).end();
});

module.exports = router;
