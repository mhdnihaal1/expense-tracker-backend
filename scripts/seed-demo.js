// Creates a demo user with ~3 months of realistic data.
//   npm run seed:demo   →   demo@expense.app / demo1234
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { mongoUri } = require('../src/config');
const { User, Account, Category, Transaction, Budget, Goal, Recurring } = require('../src/models');
const { seedNewUser } = require('../src/services/seed');
const { addPeriod } = require('../src/services/dates');

const EMAIL = 'demo@expense.app';
const PASSWORD = 'demo1234';

// Deterministic pseudo-random so the demo looks the same every time.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;

async function main() {
  await mongoose.connect(mongoUri);
  const existing = await User.findOne({ email: EMAIL });
  if (existing) {
    const userId = existing._id;
    await Promise.all([Account, Category, Transaction, Budget, Goal, Recurring].map((M) => M.deleteMany({ userId })));
    await existing.deleteOne();
  }

  const user = await User.create({ name: 'Alex Morgan', email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 10), currency: 'USD' });
  const userId = user._id;
  await seedNewUser(userId);

  const cash = await Account.findOne({ userId, name: 'Cash' });
  cash.openingBalance = 1200;
  await cash.save();
  const bank = await Account.create({ userId, name: 'Chase Checking', type: 'bank', icon: 'business', color: '#3B82F6', openingBalance: 2400 });
  const card = await Account.create({ userId, name: 'Visa Card', type: 'card', icon: 'card', color: '#EC4899', openingBalance: 0 });
  const savings = await Account.create({ userId, name: 'Savings', type: 'savings', icon: 'shield-checkmark', color: '#F59E0B', openingBalance: 5000 });

  const cats = await Category.find({ userId });
  const cat = (name, type = 'expense') => cats.find((c) => c.name === name && c.type === type)._id;

  const spendPlan = [
    { name: 'Food & Dining', perMonth: 14, min: 8, max: 45, notes: ['Lunch', 'Coffee', 'Dinner out', 'Pizza night', 'Sushi', 'Brunch'], accounts: [card, cash] },
    { name: 'Groceries', perMonth: 6, min: 35, max: 120, notes: ['Whole Foods', 'Trader Joe\'s', 'Weekly groceries', 'Costco'], accounts: [card, bank] },
    { name: 'Transport', perMonth: 8, min: 3, max: 40, notes: ['Uber', 'Gas', 'Metro card', 'Parking'], accounts: [card, cash] },
    { name: 'Shopping', perMonth: 3, min: 20, max: 160, notes: ['Amazon', 'New shoes', 'Clothes', 'Home decor'], accounts: [card] },
    { name: 'Entertainment', perMonth: 3, min: 12, max: 70, notes: ['Movie tickets', 'Concert', 'Bowling', 'Game'], accounts: [card] },
    { name: 'Health', perMonth: 1, min: 15, max: 90, notes: ['Pharmacy', 'Doctor copay', 'Vitamins'], accounts: [card] },
    { name: 'Personal Care', perMonth: 1, min: 20, max: 60, notes: ['Haircut', 'Skincare'], accounts: [card, cash] },
  ];
  const tagsFor = { 'Food & Dining': ['work', 'friends'], Shopping: ['online'], Transport: ['commute'] };

  const now = new Date();
  const txs = [];
  for (let back = 2; back >= 0; back--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const monthEnd = back === 0 ? now : new Date(now.getFullYear(), now.getMonth() - back + 1, 0, 23, 59);
    const daySpan = Math.max(1, monthEnd.getDate());
    const scale = back === 0 ? daySpan / 30 : 1;

    for (const plan of spendPlan) {
      const count = Math.max(1, Math.round(plan.perMonth * scale * (0.8 + rand() * 0.4)));
      for (let i = 0; i < count; i++) {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 + Math.floor(rand() * daySpan), 8 + Math.floor(rand() * 13), Math.floor(rand() * 60));
        if (date > now) continue;
        const tagPool = tagsFor[plan.name];
        txs.push({
          userId, type: 'expense', amount: between(plan.min, plan.max), accountId: pick(plan.accounts)._id,
          categoryId: cat(plan.name), date, note: pick(plan.notes),
          tags: tagPool && rand() < 0.35 ? [pick(tagPool)] : [],
        });
      }
    }
    const day = (d) => new Date(monthStart.getFullYear(), monthStart.getMonth(), d, 10);
    if (day(15) <= now) {
      txs.push({ userId, type: 'income', amount: between(600, 1400), accountId: bank._id, categoryId: cat('Freelance', 'income'), date: day(15), note: 'Client project' });
    }
    if (day(25) <= now) {
      txs.push({ userId, type: 'transfer', amount: 400, accountId: bank._id, toAccountId: savings._id, date: day(25), note: 'Monthly savings' });
      txs.push({ userId, type: 'transfer', amount: between(300, 700), accountId: bank._id, toAccountId: card._id, date: day(26), note: 'Card payment' });
    }
  }
  await Transaction.insertMany(txs);

  // Recurring rules back-fill salary, rent and subscriptions for the past 3 months.
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1, 9);
  const rules = [
    { type: 'income', amount: 4200, accountId: bank._id, categoryId: cat('Salary', 'income'), note: 'Monthly salary', frequency: 'monthly', startDate: threeMonthsAgo },
    { type: 'expense', amount: 1450, accountId: bank._id, categoryId: cat('Rent'), note: 'Apartment rent', frequency: 'monthly', startDate: new Date(threeMonthsAgo.getTime() + 86400000) },
    { type: 'expense', amount: 15.99, accountId: card._id, categoryId: cat('Subscriptions'), note: 'Netflix', frequency: 'monthly', startDate: new Date(threeMonthsAgo.getTime() + 4 * 86400000) },
    { type: 'expense', amount: 10.99, accountId: card._id, categoryId: cat('Subscriptions'), note: 'Spotify', frequency: 'monthly', startDate: new Date(threeMonthsAgo.getTime() + 9 * 86400000) },
    { type: 'expense', amount: 89, accountId: bank._id, categoryId: cat('Bills & Utilities'), note: 'Electricity & internet', frequency: 'monthly', startDate: new Date(threeMonthsAgo.getTime() + 6 * 86400000) },
    { type: 'expense', amount: 35, accountId: card._id, categoryId: cat('Health'), note: 'Gym membership', frequency: 'monthly', startDate: new Date(threeMonthsAgo.getTime() + 2 * 86400000) },
  ];
  for (const r of rules) {
    let date = r.startDate;
    const anchor = date.getDate();
    while (date <= now) {
      await Transaction.create({ ...r, frequency: undefined, startDate: undefined, userId, date });
      date = addPeriod(date, r.frequency, anchor);
    }
    await Recurring.create({ ...r, userId, nextRunDate: date });
  }

  await Budget.insertMany([
    { userId, categoryId: null, amount: 3200 },
    { userId, categoryId: cat('Food & Dining'), amount: 350 },
    { userId, categoryId: cat('Groceries'), amount: 500 },
    { userId, categoryId: cat('Transport'), amount: 150 },
    { userId, categoryId: cat('Shopping'), amount: 200 },
    { userId, categoryId: cat('Entertainment'), amount: 120 },
  ]);

  const inMonths = (m) => new Date(now.getFullYear(), now.getMonth() + m, 1);
  await Goal.insertMany([
    { userId, name: 'Japan Trip', targetAmount: 4000, savedAmount: 1650, deadline: inMonths(8), icon: 'airplane', color: '#06B6D4',
      contributions: [{ amount: 1000, date: inMonths(-2) }, { amount: 400, date: inMonths(-1) }, { amount: 250, date: now }] },
    { userId, name: 'Emergency Fund', targetAmount: 10000, savedAmount: 6200, icon: 'shield-checkmark', color: '#10B981',
      contributions: [{ amount: 5000, date: inMonths(-2) }, { amount: 1200, date: inMonths(-1) }] },
    { userId, name: 'New Laptop', targetAmount: 2200, savedAmount: 2200, deadline: inMonths(1), icon: 'laptop', color: '#6366F1',
      contributions: [{ amount: 2200, date: inMonths(-1) }] },
  ]);

  const count = await Transaction.countDocuments({ userId });
  console.log(`Demo data ready: ${count} transactions. Login with ${EMAIL} / ${PASSWORD}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
