const { Types } = require('mongoose');
const { Transaction } = require('../models');

// Returns Map<accountId string, net change from transactions>.
async function accountDeltas(userId) {
  const uid = new Types.ObjectId(String(userId));
  const [outgoing, incoming] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: uid } },
      {
        $group: {
          _id: '$accountId',
          total: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', { $multiply: ['$amount', -1] }] },
          },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { userId: uid, type: 'transfer', toAccountId: { $ne: null } } },
      { $group: { _id: '$toAccountId', total: { $sum: '$amount' } } },
    ]),
  ]);
  const deltas = new Map();
  for (const row of [...outgoing, ...incoming]) {
    const key = String(row._id);
    deltas.set(key, (deltas.get(key) || 0) + row.total);
  }
  return deltas;
}

async function withBalances(userId, accounts) {
  const deltas = await accountDeltas(userId);
  return accounts.map((a) => {
    const obj = typeof a.toObject === 'function' ? a.toObject() : a;
    const balance = Math.round(((obj.openingBalance || 0) + (deltas.get(String(obj._id)) || 0)) * 100) / 100;
    return { ...obj, balance };
  });
}

module.exports = { accountDeltas, withBalances };
