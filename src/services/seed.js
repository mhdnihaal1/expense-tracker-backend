const { Account, Category } = require('../models');

const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', type: 'expense', icon: 'restaurant', color: '#F97316' },
  { name: 'Groceries', type: 'expense', icon: 'cart', color: '#22C55E' },
  { name: 'Transport', type: 'expense', icon: 'car', color: '#3B82F6' },
  { name: 'Shopping', type: 'expense', icon: 'bag-handle', color: '#EC4899' },
  { name: 'Bills & Utilities', type: 'expense', icon: 'flash', color: '#EAB308' },
  { name: 'Rent', type: 'expense', icon: 'home', color: '#8B5CF6' },
  { name: 'Entertainment', type: 'expense', icon: 'film', color: '#EF4444' },
  { name: 'Health', type: 'expense', icon: 'medkit', color: '#14B8A6' },
  { name: 'Education', type: 'expense', icon: 'school', color: '#0EA5E9' },
  { name: 'Travel', type: 'expense', icon: 'airplane', color: '#06B6D4' },
  { name: 'Subscriptions', type: 'expense', icon: 'repeat', color: '#A855F7' },
  { name: 'Personal Care', type: 'expense', icon: 'sparkles', color: '#F472B6' },
  { name: 'Gifts', type: 'expense', icon: 'gift', color: '#FB7185' },
  { name: 'Other', type: 'expense', icon: 'ellipsis-horizontal', color: '#64748B' },
  { name: 'Salary', type: 'income', icon: 'briefcase', color: '#10B981' },
  { name: 'Freelance', type: 'income', icon: 'laptop', color: '#6366F1' },
  { name: 'Investments', type: 'income', icon: 'trending-up', color: '#0EA5E9' },
  { name: 'Gifts Received', type: 'income', icon: 'gift', color: '#F59E0B' },
  { name: 'Other', type: 'income', icon: 'ellipsis-horizontal', color: '#64748B' },
];

async function seedNewUser(userId) {
  await Category.insertMany(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId, isDefault: true })));
  await Account.create({ userId, name: 'Cash', type: 'cash', icon: 'cash', color: '#10B981' });
}

module.exports = { seedNewUser, DEFAULT_CATEGORIES };
