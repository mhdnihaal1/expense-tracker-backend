const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { seedNewUser } = require('../services/seed');
const { z } = require('../services/schemas');

const router = express.Router();

const signToken = (user) => jwt.sign({ sub: String(user._id) }, jwtSecret, { expiresIn: jwtExpiresIn });

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.email('Enter a valid email').transform((e) => e.toLowerCase().trim()),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  currency: z.string().length(3).toUpperCase().optional(),
});

router.post('/register', validate(registerSchema), async (req, res) => {
  const { name, email, password, currency } = req.body;
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
  const user = await User.create({ name, email, currency, passwordHash: await bcrypt.hash(password, 10) });
  await seedNewUser(user._id);
  res.status(201).json({ token: signToken(user), user: user.toPublic() });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  res.json({ token: signToken(user), user: user.toPublic() });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'User no longer exists');
  res.json({ user: user.toPublic() });
});

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
});

router.patch('/me', requireAuth, validate(updateMeSchema), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.userId, req.body, { returnDocument: 'after' });
  if (!user) throw new HttpError(401, 'User no longer exists');
  res.json({ user: user.toPublic() });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

router.post('/change-password', requireAuth, validate(changePasswordSchema), async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Current password is incorrect', { currentPassword: 'Incorrect password' });
  }
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await user.save();
  res.json({ ok: true });
});

module.exports = router;
