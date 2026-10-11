const express = require('express');
const { Types } = require('mongoose');
const { Transaction, Account, Budget, Category } = require('../models');
const { validate } = require('../middleware/validate');
const { withBalances } = require('../services/balances');
const { monthRange, shiftMonth, currentMonth } = require('../services/dates');
const { z } = require('../services/schemas');

const router = express.Router();

const round2 = (n) => Math.round(n * 100) / 100;
const oid = (id) => new Types.ObjectId(String(id));

const baseQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional(),
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
});

// Mongo $dateToString timezone, e.g. tzOffset -330 (IST) => "+05:30".
function mongoTz(tzOffset) {
  const mins = -tzOffset;
  const sign = mins >= 0 ? '+' : '-';
  const abs = Math.abs(mins);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

async function totals(userId, start, end) {
  const rows = await Transaction.aggregate([
    { $match: { userId: oid(userId), date: { $gte: start, $lt: end }, type: { $in: ['income', 'expense'] } } },
    { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const out = { income: 0, expense: 0, count: 0 };
  for (const r of rows) {
    out[r._id] = round2(r.total);
    out.count += r.count;
  }
  return out;
}

const pctChange = (cur, prev) => (prev === 0 ? (cur === 0 ? 0 : null) : round2(((cur - prev) / prev) * 100));

router.get('/summary', validate(baseQuery, 'query'), async (req, res) => {
  const { tzOffset } = req.validQuery;
  const month = req.validQuery.month || currentMonth(tzOffset);
  const range = monthRange(month, tzOffset);
  const prevRange = monthRange(shiftMonth(month, -1), tzOffset);

  const [cur, prev, accounts] = await Promise.all([
    totals(req.userId, range.start, range.end),
    totals(req.userId, prevRange.start, prevRange.end),
    Account.find({ userId: req.userId, archived: false }),
  ]);
  const withBal = await withBalances(req.userId, accounts);
  const totalBalance = round2(withBal.reduce((s, a) => s + a.balance, 0));

  const now = new Date();
  const elapsedDays = now >= range.end ? range.days
    : now < range.start ? 0
    : Math.ceil((now - range.start) / 86400000);

  res.json({
    month,
    income: cur.income,
    expense: cur.expense,
    net: round2(cur.income - cur.expense),
    transactionCount: cur.count,
    totalBalance,
    dailyAverage: elapsedDays ? round2(cur.expense / elapsedDays) : 0,
    savingsRate: cur.income ? round2(((cur.income - cur.expense) / cur.income) * 100) : null,
    previous: { income: prev.income, expense: prev.expense },
    change: { income: pctChange(cur.income, prev.income), expense: pctChange(cur.expense, prev.expense) },
  });
});

const byCategoryQuery = baseQuery.extend({
  type: z.enum(['expense', 'income']).default('expense'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.get('/by-category', validate(byCategoryQuery, 'query'), async (req, res) => {
  const { type, from, to, tzOffset } = req.validQuery;
  let start = from;
  let end = to;
  if (!start || !end) {
    const range = monthRange(req.validQuery.month || currentMonth(tzOffset), tzOffset);
    start = range.start;
    end = range.end;
  }
  const rows = await Transaction.aggregate([
    { $match: { userId: oid(req.userId), type, date: { $gte: start, $lt: end } } },
    { $group: { _id: '$categoryId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $lookup: { from: Category.collection.name, localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $sort: { total: -1 } },
  ]);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  res.json({
    type,
    total: round2(grand),
    items: rows.map((r) => ({
      categoryId: r._id,
      name: r.category?.name ?? 'Uncategorized',
      icon: r.category?.icon ?? 'help',
      color: r.category?.color ?? '#94A3B8',
      total: round2(r.total),
      count: r.count,
      percent: grand ? round2((r.total / grand) * 100) : 0,
    })),
  });
});

const trendQuery = baseQuery.extend({ months: z.coerce.number().int().min(1).max(24).default(6) });

router.get('/trend', validate(trendQuery, 'query'), async (req, res) => {
  const { months, tzOffset } = req.validQuery;
  const last = req.validQuery.month || currentMonth(tzOffset);
  const first = shiftMonth(last, -(months - 1));
  const start = monthRange(first, tzOffset).start;
  const end = monthRange(last, tzOffset).end;

  const rows = await Transaction.aggregate([
    { $match: { userId: oid(req.userId), type: { $in: ['income', 'expense'] }, date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$date', timezone: mongoTz(tzOffset) } }, type: '$type' },
        total: { $sum: '$amount' },
      },
    },
  ]);
  const items = [];
  for (let i = 0; i < months; i++) {
    const m = shiftMonth(first, i);
    const get = (t) => round2(rows.find((r) => r._id.month === m && r._id.type === t)?.total || 0);
    items.push({ month: m, income: get('income'), expense: get('expense') });
  }
  res.json({ items });
});

const dailyQuery = baseQuery.extend({ days: z.coerce.number().int().min(1).max(92).default(7) });

router.get('/daily', validate(dailyQuery, 'query'), async (req, res) => {
  const { days, tzOffset } = req.validQuery;
  const shift = tzOffset * 60000;
  const localNow = new Date(Date.now() - shift);
  const todayStartUtc = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) + shift;
  const start = new Date(todayStartUtc - (days - 1) * 86400000);
  const end = new Date(todayStartUtc + 86400000);

  const rows = await Transaction.aggregate([
    { $match: { userId: oid(req.userId), type: 'expense', date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: mongoTz(tzOffset) } },
        total: { $sum: '$amount' },
      },
    },
  ]);
  const items = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * 86400000 - shift).toISOString().slice(0, 10);
    items.push({ date: day, expense: round2(rows.find((r) => r._id === day)?.total || 0) });
  }
  res.json({ items });
});

router.get('/budgets', validate(baseQuery, 'query'), async (req, res) => {
  const { tzOffset } = req.validQuery;
  const month = req.validQuery.month || currentMonth(tzOffset);
  const range = monthRange(month, tzOffset);
  const [budgets, spentRows] = await Promise.all([
    Budget.find({ userId: req.userId }).populate('categoryId', 'name icon color type'),
    Transaction.aggregate([
      { $match: { userId: oid(req.userId), type: 'expense', date: { $gte: range.start, $lt: range.end } } },
      { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
    ]),
  ]);
  const totalSpent = spentRows.reduce((s, r) => s + r.total, 0);
  const items = budgets.map((b) => {
    const spent = round2(b.categoryId
      ? spentRows.find((r) => String(r._id) === String(b.categoryId._id))?.total || 0
      : totalSpent);
    const percent = round2((spent / b.amount) * 100);
    const status = percent >= 100 ? 'over' : percent >= b.alertThreshold ? 'warning' : 'ok';
    return {
      _id: b._id,
      category: b.categoryId,
      amount: b.amount,
      alertThreshold: b.alertThreshold,
      spent,
      remaining: round2(b.amount - spent),
      percent,
      status,
    };
  });
  // Overall budget first, then most-used.
  items.sort((a, b) => (a.category ? 1 : 0) - (b.category ? 1 : 0) || b.percent - a.percent);
  res.json({ month, items });
});

module.exports = router;
