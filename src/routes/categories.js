const express = require('express');
const { Category, Transaction, Budget, Recurring } = require('../models');
const { validate } = require('../middleware/validate');
const { HttpError } = require('../middleware/error');
const { findOwned } = require('../services/ownership');
const { z, color, icon, patchOf } = require('../services/schemas');

const router = express.Router();

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  type: z.enum(['expense', 'income']),
  icon: icon.default('pricetag'),
  color: color.default('#64748B'),
});

router.get('/', async (req, res) => {
  const filter = { userId: req.userId };
  if (req.query.type) filter.type = req.query.type;
  const items = await Category.find(filter).sort({ type: 1, isDefault: -1, name: 1 });
  res.json({ items });
});

router.post('/', validate(categorySchema), async (req, res) => {
  if (await Category.exists({ userId: req.userId, type: req.body.type, name: req.body.name })) {
    throw new HttpError(409, 'A category with this name already exists', { name: 'Already exists' });
  }
  const category = await Category.create({ ...req.body, userId: req.userId });
  res.status(201).json(category);
});

router.patch('/:id', validate(patchOf(categorySchema.omit({ type: true }))), async (req, res) => {
  const category = await findOwned(Category, req.params.id, req.userId, 'Category');
  category.set(req.body);
  await category.save();
  res.json(category);
});

// Deleting a category moves its transactions to the "Other" category of the same type.
router.delete('/:id', async (req, res) => {
  const category = await findOwned(Category, req.params.id, req.userId, 'Category');
  let fallback = await Category.findOne({ userId: req.userId, type: category.type, name: 'Other' });
  if (fallback && String(fallback._id) === String(category._id)) {
    throw new HttpError(400, 'The "Other" category cannot be deleted');
  }
  if (!fallback) {
    fallback = await Category.create({
      userId: req.userId, type: category.type, name: 'Other', icon: 'ellipsis-horizontal', color: '#64748B', isDefault: true,
    });
  }
  await Transaction.updateMany({ userId: req.userId, categoryId: category._id }, { categoryId: fallback._id });
  await Recurring.updateMany({ userId: req.userId, categoryId: category._id }, { categoryId: fallback._id });
  await Budget.deleteMany({ userId: req.userId, categoryId: category._id });
  await category.deleteOne();
  res.status(204).end();
});

module.exports = router;
