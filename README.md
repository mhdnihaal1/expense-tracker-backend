# Spendwise API: Expense Tracker Backend

The **Node.js / Express 5 / MongoDB** REST API for Spendwise, a personal finance app.
The React Native (Expo) client lives in **[expense-tracker-frontend](https://github.com/mhdnihaal1/expense-tracker-frontend)**.

**Live API:** https://expense-tracker-backend.onrender.com/api (hosted on Render) · **Web app:** https://expense-tracker-frontend-beryl-psi.vercel.app

## Features

- JWT auth with bcrypt-hashed passwords. Registering seeds 19 default categories and a Cash account.
- Accounts with balances computed by aggregation (opening balance, income, expense and transfers).
- Transactions (expense, income, transfer) with full-text search and filters.
- Categories. Deleting one moves its transactions to "Other".
- Monthly budgets (overall and per category) with alert thresholds.
- Savings goals with contributions and withdrawals.
- Recurring rules (daily, weekly, monthly, yearly), auto-posted by a scheduler with back-fill and month-end anchoring.
- Stats: monthly summary, by-category totals, trends and daily totals. Every stat follows the user's timezone.
- CSV export with formula-injection protection.
- zod validation on every endpoint. All data is scoped per user.

## Quick start

Prerequisites: **Node 22.5+** (tested on 24), and **Docker** or a MongoDB Atlas URI.

```bash
docker compose up -d            # MongoDB 7 on localhost:27017 (skip if using Atlas)
cp .env.example .env            # set JWT_SECRET, and MONGODB_URI if using Atlas
npm install
npm run seed:demo               # optional: demo@expense.app / demo1234 with 3 months of data
npm run dev                     # http://localhost:4000/api
```

| Script | |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start for production |
| `npm test` | 11 API tests on an in-memory MongoDB |
| `npm run seed:demo` | Create the demo user and sample data |

## Environment

| Variable | Default |
|---|---|
| `PORT` | `4000` |
| `MONGODB_URI` | `mongodb://localhost:27017/expense_tracker` |
| `JWT_SECRET` | Required. Use a long random string |
| `JWT_EXPIRES_IN` | `30d` |
| `CORS_ORIGINS` | `https://expense-tracker-frontend-beryl-psi.vercel.app`. Comma-separated web origins allowed to call the API. Vercel previews and localhost/LAN dev origins are always allowed |

## Project structure

```
src/
  app.js, server.js        Express app (exported for tests) and entry point
  models/                  User, Account, Category, Transaction, Budget, Goal, Recurring
  routes/                  auth, accounts, categories, transactions, budgets, goals, recurring, stats, export
  services/                balances, recurring scheduler, dates/timezones, seed, validation schemas
  middleware/              JWT auth, zod validation, error handling
scripts/seed-demo.js
test/api.test.js           node:test + supertest + mongodb-memory-server
```

## API reference

All routes are under `/api`. Everything except `/auth/register` and `/auth/login` needs `Authorization: Bearer <token>`.
Stats endpoints accept `tzOffset` (minutes, from `Date#getTimezoneOffset`) so month and day boundaries follow the user's local calendar.

| Method & path | Description |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Returns `{ token, user }` |
| `GET/PATCH /auth/me`, `POST /auth/change-password` | Profile (name, currency, theme) |
| `GET/POST/PATCH/DELETE /accounts[/:id]` | Includes computed `balance`. `DELETE ?force=true` also removes the account's transactions |
| `GET/POST/PATCH/DELETE /categories[/:id]` | Deleting reassigns transactions to "Other" |
| `GET /transactions` | Filters: `q, type, accountId, categoryId, from, to, minAmount, maxAmount, page, limit` |
| `POST/PATCH/DELETE /transactions[/:id]`, `GET /transactions/tags` | |
| `GET/POST/PATCH/DELETE /budgets[/:id]` | `categoryId: null` is the overall budget |
| `GET/POST/PATCH/DELETE /goals[/:id]`, `POST /goals/:id/contribute` | A negative amount is a withdrawal |
| `GET/POST/PATCH/DELETE /recurring[/:id]`, `POST /recurring/:id/toggle` | |
| `GET /stats/summary?month=YYYY-MM` | Income, expense, net, balance, daily average, savings rate, change vs. last month |
| `GET /stats/by-category?month&type` | Totals and % per category |
| `GET /stats/trend?months=6`, `GET /stats/daily?days=7` | Charts |
| `GET /stats/budgets?month` | Spent, remaining, % and status (`ok` / `warning` / `over`) per budget |
| `GET /export/csv?from&to` | CSV download |
