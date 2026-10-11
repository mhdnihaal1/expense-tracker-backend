const { Recurring, Transaction } = require('../models');
const { addPeriod } = require('./dates');

const MAX_CATCH_UP = 366; // safety cap per rule per run
const lastRunByUser = new Map();

// Materialize every due occurrence of active recurring rules into real transactions.
// Each occurrence is claimed atomically (compare-and-set on nextRunDate) so concurrent
// runs never create duplicates.
async function processDue({ userId, now = new Date() } = {}) {
  const filter = { active: true, nextRunDate: { $lte: now } };
  if (userId) filter.userId = userId;
  const rules = await Recurring.find(filter);
  let created = 0;

  for (const rule of rules) {
    const anchorDay = rule.startDate.getUTCDate();
    let runDate = rule.nextRunDate;
    for (let i = 0; i < MAX_CATCH_UP && runDate <= now; i++) {
      if (rule.endDate && runDate > rule.endDate) break;
      const next = addPeriod(runDate, rule.frequency, anchorDay);
      const claimed = await Recurring.findOneAndUpdate(
        { _id: rule._id, nextRunDate: runDate, active: true },
        { nextRunDate: next },
        { returnDocument: 'after' }
      );
      if (!claimed) break; // another run took it
      await Transaction.create({
        userId: rule.userId,
        type: rule.type,
        amount: rule.amount,
        accountId: rule.accountId,
        toAccountId: rule.toAccountId,
        categoryId: rule.categoryId,
        note: rule.note,
        date: runDate,
        recurringId: rule._id,
      });
      created++;
      runDate = next;
    }
    if (rule.endDate && runDate > rule.endDate) {
      await Recurring.updateOne({ _id: rule._id }, { active: false });
    }
  }
  return created;
}

// Express middleware: lazily catch up a user's recurring rules, at most once a minute.
function catchUpRecurring(req, _res, next) {
  const last = lastRunByUser.get(req.userId) || 0;
  if (Date.now() - last < 60 * 1000) return next();
  lastRunByUser.set(req.userId, Date.now());
  processDue({ userId: req.userId }).then(() => next(), next);
}

function startScheduler(intervalMs = 60 * 60 * 1000) {
  const tick = () => processDue().catch((err) => console.error('[recurring]', err));
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { processDue, catchUpRecurring, startScheduler };
