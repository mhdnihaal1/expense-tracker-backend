// Month helpers. Clients pass tzOffset (minutes, as returned by JS Date#getTimezoneOffset)
// so month boundaries match the user's local calendar rather than the server's.

function parseMonth(month) {
  const now = new Date();
  if (!month) return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const [y, m] = month.split('-').map(Number);
  return { year: y, month: m };
}

function monthRange(month, tzOffset = 0) {
  const { year, month: m } = parseMonth(month);
  const shift = tzOffset * 60 * 1000;
  const start = new Date(Date.UTC(year, m - 1, 1) + shift);
  const end = new Date(Date.UTC(year, m, 1) + shift);
  return { start, end, year, month: m, days: new Date(Date.UTC(year, m, 0)).getUTCDate() };
}

function shiftMonth(month, delta) {
  const { year, month: m } = parseMonth(month);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentMonth(tzOffset = 0) {
  const local = new Date(Date.now() - tzOffset * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Advance a date by one period. anchorDay keeps monthly/yearly rules on their original
// day-of-month (e.g. the 31st falls back to the 30th/28th but returns to the 31st).
function addPeriod(date, frequency, anchorDay) {
  const d = new Date(date);
  if (frequency === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else {
    const months = frequency === 'monthly' ? 1 : 12;
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(anchorDay ?? d.getUTCDate(), lastDay));
    target.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
    return target;
  }
  return d;
}

module.exports = { monthRange, shiftMonth, currentMonth, addPeriod };
