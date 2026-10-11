const express = require('express');
const { Transaction } = require('../models');
const { validate } = require('../middleware/validate');
const { z } = require('../services/schemas');

const router = express.Router();

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  // Quote when needed; prefix formula-like values so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const exportQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.get('/csv', validate(exportQuery, 'query'), async (req, res) => {
  const { from, to } = req.validQuery;
  const filter = { userId: req.userId };
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const txs = await Transaction.find(filter)
    .sort({ date: -1 })
    .populate('categoryId', 'name')
    .populate('accountId', 'name')
    .populate('toAccountId', 'name')
    .lean();

  const header = ['Date', 'Type', 'Amount', 'Category', 'Account', 'To Account', 'Note', 'Tags'];
  const lines = [header.join(',')];
  for (const t of txs) {
    lines.push([
      t.date.toISOString(),
      t.type,
      t.type === 'expense' ? -t.amount : t.amount,
      t.categoryId?.name,
      t.accountId?.name,
      t.toAccountId?.name,
      t.note,
      (t.tags || []).join('; '),
    ].map(csvCell).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;
