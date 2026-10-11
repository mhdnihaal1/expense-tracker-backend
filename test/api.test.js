const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { processDue } = require('../src/services/recurring');
const { addPeriod } = require('../src/services/dates');

let mongod;
let app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function register(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Test', email, password: 'secret123' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const token = res.body.token;
  const api = {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    del: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
  const cats = (await api.get('/api/categories')).body.items;
  const cat = (name, type = 'expense') => cats.find((c) => c.name === name && c.type === type)._id;
  const cash = (await api.get('/api/accounts')).body.items[0];
  return { api, token, cat, cash };
}

describe('auth', () => {
  test('register, login, me, duplicate email, bad password', async () => {
    await register('a@x.com');
    const dup = await request(app).post('/api/auth/register').send({ name: 'A', email: 'A@x.com', password: 'secret123' });
    assert.equal(dup.status, 409);
    const bad = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'nope' });
    assert.equal(bad.status, 401);
    const ok = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'secret123' });
    assert.equal(ok.status, 200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ok.body.token}`);
    assert.equal(me.body.user.email, 'a@x.com');
    assert.equal((await request(app).get('/api/accounts')).status, 401);
  });

  test('validation errors are reported per field', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'bad', password: '1' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.email && res.body.fields.password && res.body.fields.name);
  });
});

describe('transactions & balances', () => {
  test('balance reflects income, expense and transfer', async () => {
    const { api, cat, cash } = await register('bal@x.com');
    const bank = (await api.post('/api/accounts', { name: 'Bank', type: 'bank', openingBalance: 1000 })).body;
    assert.equal(bank.balance, 1000);

    await api.post('/api/transactions', { type: 'income', amount: 500, accountId: bank._id, categoryId: cat('Salary', 'income') }).expect(201);
    await api.post('/api/transactions', { type: 'expense', amount: 120.5, accountId: bank._id, categoryId: cat('Groceries') }).expect(201);
    await api.post('/api/transactions', { type: 'transfer', amount: 200, accountId: bank._id, toAccountId: cash._id }).expect(201);

    const { items, totalBalance } = (await api.get('/api/accounts')).body;
    assert.equal(items.find((a) => a.name === 'Bank').balance, 1179.5);
    assert.equal(items.find((a) => a.name === 'Cash').balance, 200);
    assert.equal(totalBalance, 1379.5);
  });

  test('rejects wrong category type, same-account transfer and partial PATCH keeps fields', async () => {
    const { api, cat, cash } = await register('rules@x.com');
    const wrong = await api.post('/api/transactions', { type: 'expense', amount: 5, accountId: cash._id, categoryId: cat('Salary', 'income') });
    assert.equal(wrong.status, 400);
    const same = await api.post('/api/transactions', { type: 'transfer', amount: 5, accountId: cash._id, toAccountId: cash._id });
    assert.equal(same.status, 400);

    const tx = (await api.post('/api/transactions', { type: 'expense', amount: 9, accountId: cash._id, categoryId: cat('Transport'), note: 'bus', tags: ['work'] })).body;
    const patched = (await api.patch(`/api/transactions/${tx._id}`, { amount: 12 })).body;
    assert.equal(patched.amount, 12);
    assert.equal(patched.note, 'bus');
    assert.deepEqual(patched.tags, ['work']);
  });

  test('search and filters', async () => {
    const { api, cat, cash } = await register('search@x.com');
    await api.post('/api/transactions', { type: 'expense', amount: 4, accountId: cash._id, categoryId: cat('Food & Dining'), note: 'Coffee (large)' });
    await api.post('/api/transactions', { type: 'expense', amount: 60, accountId: cash._id, categoryId: cat('Shopping'), tags: ['gift'] });
    await api.post('/api/transactions', { type: 'income', amount: 100, accountId: cash._id, categoryId: cat('Freelance', 'income') });

    assert.equal((await api.get('/api/transactions?q=coffee (')).body.total, 1);
    assert.equal((await api.get('/api/transactions?q=gift')).body.total, 1);
    assert.equal((await api.get('/api/transactions?q=shopping')).body.total, 1);
    assert.equal((await api.get('/api/transactions?type=expense')).body.total, 2);
    assert.equal((await api.get('/api/transactions?minAmount=50')).body.total, 2);
    const page = (await api.get('/api/transactions?limit=2')).body;
    assert.equal(page.items.length, 2);
    assert.equal(page.hasMore, true);
  });

  test('users cannot see or modify each other\'s data', async () => {
    const a = await register('iso-a@x.com');
    const b = await register('iso-b@x.com');
    const tx = (await a.api.post('/api/transactions', { type: 'expense', amount: 5, accountId: a.cash._id, categoryId: a.cat('Other') })).body;
    assert.equal((await b.api.get(`/api/transactions/${tx._id}`)).status, 404);
    assert.equal((await b.api.del(`/api/transactions/${tx._id}`)).status, 404);
    assert.equal((await b.api.get('/api/transactions')).body.total, 0);
    // b cannot post into a's account
    const cross = await b.api.post('/api/transactions', { type: 'expense', amount: 5, accountId: a.cash._id, categoryId: b.cat('Other') });
    assert.equal(cross.status, 400);
  });
});

describe('budgets, stats, goals', () => {
  test('budget status and stats aggregation', async () => {
    const { api, cat, cash } = await register('stats@x.com');
    await api.post('/api/budgets', { categoryId: cat('Food & Dining'), amount: 100 }).expect(201);
    await api.post('/api/budgets', { amount: 1000 }).expect(201);
    assert.equal((await api.post('/api/budgets', { amount: 50 })).status, 409);

    await api.post('/api/transactions', { type: 'expense', amount: 85, accountId: cash._id, categoryId: cat('Food & Dining') });
    await api.post('/api/transactions', { type: 'expense', amount: 15, accountId: cash._id, categoryId: cat('Transport') });
    await api.post('/api/transactions', { type: 'income', amount: 400, accountId: cash._id, categoryId: cat('Salary', 'income') });

    const budgets = (await api.get('/api/stats/budgets')).body.items;
    assert.equal(budgets[0].category, null); // overall first
    assert.equal(budgets[0].spent, 100);
    const food = budgets.find((b) => b.category?.name === 'Food & Dining');
    assert.equal(food.percent, 85);
    assert.equal(food.status, 'warning');

    const summary = (await api.get('/api/stats/summary')).body;
    assert.equal(summary.income, 400);
    assert.equal(summary.expense, 100);
    assert.equal(summary.net, 300);
    assert.equal(summary.savingsRate, 75);
    assert.equal(summary.totalBalance, 300);

    const byCat = (await api.get('/api/stats/by-category')).body;
    assert.equal(byCat.items[0].name, 'Food & Dining');
    assert.equal(byCat.items[0].percent, 85);

    const trend = (await api.get('/api/stats/trend?months=3')).body.items;
    assert.equal(trend.length, 3);
    assert.equal(trend[2].expense, 100);

    const daily = (await api.get('/api/stats/daily?days=7')).body.items;
    assert.equal(daily.length, 7);
    assert.equal(daily[6].expense, 100);
  });

  test('goal contributions', async () => {
    const { api } = await register('goal@x.com');
    const goal = (await api.post('/api/goals', { name: 'Laptop', targetAmount: 1500 })).body;
    await api.post(`/api/goals/${goal._id}/contribute`, { amount: 300 }).expect(200);
    const after = (await api.post(`/api/goals/${goal._id}/contribute`, { amount: -100 })).body;
    assert.equal(after.savedAmount, 200);
    assert.equal(after.contributions.length, 2);
    assert.equal((await api.post(`/api/goals/${goal._id}/contribute`, { amount: -500 })).status, 400);
  });
});

describe('recurring', () => {
  test('addPeriod keeps month-end anchor', () => {
    const jan31 = new Date('2026-01-31T09:00:00Z');
    const feb = addPeriod(jan31, 'monthly', 31);
    assert.equal(feb.toISOString(), '2026-02-28T09:00:00.000Z');
    assert.equal(addPeriod(feb, 'monthly', 31).toISOString(), '2026-03-31T09:00:00.000Z');
  });

  test('back-fills due occurrences once, no duplicates on re-run', async () => {
    const { api, cat, cash } = await register('rec@x.com');
    const start = new Date(Date.now() - 2 * 7 * 86400000 - 1000); // 3 weekly occurrences due
    const rule = (await api.post('/api/recurring', {
      type: 'expense', amount: 10, accountId: cash._id, categoryId: cat('Subscriptions'), frequency: 'weekly', startDate: start,
    })).body;
    assert.equal(rule.active, true);
    await Promise.all([processDue(), processDue()]);
    const txs = (await api.get('/api/transactions')).body;
    assert.equal(txs.total, 3);
    assert.ok(new Date(rule.nextRunDate) > new Date());

    const paused = (await api.post(`/api/recurring/${rule._id}/toggle`)).body;
    assert.equal(paused.active, false);
  });
});

describe('export', () => {
  test('csv export escapes values', async () => {
    const { api, cat, cash } = await register('csv@x.com');
    await api.post('/api/transactions', { type: 'expense', amount: 7.25, accountId: cash._id, categoryId: cat('Other'), note: 'He said "hi", ok' });
    const res = await api.get('/api/export/csv');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    const lines = res.text.split('\n');
    assert.equal(lines[0], 'Date,Type,Amount,Category,Account,To Account,Note,Tags');
    assert.match(lines[1], /,expense,-7\.25,Other,Cash,,"He said ""hi"", ok",$/);
  });
});
