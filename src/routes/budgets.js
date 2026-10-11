const express = require('express');
const { Budget, Category } = require('../models');
const { validate } = require('../middleware/validate');
const { HttpError } = require('../middleware/error');
const { findOwned } = require('../services/ownership');
const { z, objectId, money, patchOf } = require('../services/schemas');

const router = express.Router();

const budgetSchema = z.object({
  categoryId: objectId.nullable().default(null),
  amount: money,
  alertThreshold: z.coerce.number().int().min(1).max(100).default(80),
});

router.get('/', async (req, res) => {
  const items = await Budget.find({ userId: req.userId }).populate('categoryId', 'name icon color type');
  res.json({ items });
});

router.post('/', validate(budgetSchema), async (req, res) => {
  const { categoryId } = req.body;
  if (categoryId) {
    const cat = await Category.findOne({ _id: categoryId, userId: req.userId });
    if (!cat) throw new HttpError(400, 'Category not found', { categoryId: 'Category not found' });
    if (cat.type !== 'expense') throw new HttpError(400, 'Budgets are for expense categories', { categoryId: 'Choose an expense category' });
  }
  if (await Budget.exists({ userId: req.userId, categoryId })) {
    throw new HttpError(409, categoryId ? 'This category already has a budget' : 'An overall budget already exists');
  }
  const budget = await Budget.create({ ...req.body, userId: req.userId });
  await budget.populate('categoryId', 'name icon color type');
  res.status(201).json(budget);
});

router.patch('/:id', validate(patchOf(budgetSchema.omit({ categoryId: true }))), async (req, res) => {
  const budget = await findOwned(Budget, req.params.id, req.userId, 'Budget');
  budget.set(req.body);
  await budget.save();
  await budget.populate('categoryId', 'name icon color type');
  res.json(budget);
});

router.delete('/:id', async (req, res) => {
  const budget = await findOwned(Budget, req.params.id, req.userId, 'Budget');
  await budget.deleteOne();
  res.status(204).end();
});

module.exports = router;
