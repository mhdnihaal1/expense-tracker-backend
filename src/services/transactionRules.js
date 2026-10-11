const { Account, Category } = require('../models');
const { HttpError } = require('../middleware/error');
const { z, objectId, money } = require('./schemas');

const transactionShape = {
  type: z.enum(['expense', 'income', 'transfer']),
  amount: money,
  accountId: objectId,
  toAccountId: objectId.nullable().optional(),
  categoryId: objectId.nullable().optional(),
  note: z.string().trim().max(300).default(''),
};

// Cross-field and ownership checks shared by transactions and recurring rules.
async function checkTransactionRefs(userId, data) {
  const account = await Account.exists({ _id: data.accountId, userId });
  if (!account) throw new HttpError(400, 'Account not found', { accountId: 'Account not found' });

  if (data.type === 'transfer') {
    if (!data.toAccountId) throw new HttpError(400, 'Choose a destination account', { toAccountId: 'Required for transfers' });
    if (String(data.toAccountId) === String(data.accountId)) {
      throw new HttpError(400, 'Cannot transfer to the same account', { toAccountId: 'Must differ from source account' });
    }
    if (!(await Account.exists({ _id: data.toAccountId, userId }))) {
      throw new HttpError(400, 'Destination account not found', { toAccountId: 'Account not found' });
    }
    data.categoryId = null;
  } else {
    data.toAccountId = null;
    if (!data.categoryId) throw new HttpError(400, 'Choose a category', { categoryId: 'Required' });
    const category = await Category.findOne({ _id: data.categoryId, userId });
    if (!category) throw new HttpError(400, 'Category not found', { categoryId: 'Category not found' });
    if (category.type !== data.type) {
      throw new HttpError(400, `Category is for ${category.type}, not ${data.type}`, { categoryId: 'Wrong category type' });
    }
  }
  return data;
}

module.exports = { transactionShape, checkTransactionRefs };
