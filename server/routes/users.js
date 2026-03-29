'use strict';

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const { upsertUser, getUser } = require('../db');
const { requireAuth }         = require('../middleware/auth');
const { JWT_SECRET }          = require('../middleware/auth');
const jwt  = require('jsonwebtoken');
const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' }
});

/* POST /api/users/register — register or re-register a chat user */
router.post('/register', registerLimiter, (req, res) => {
  const { deviceId, username } = req.body || {};
  if (!deviceId || typeof deviceId !== 'string') return res.status(400).json({ ok: false, error: 'deviceId required' });
  if (!username || typeof username !== 'string' || username.trim().length < 1)
    return res.status(400).json({ ok: false, error: 'username required' });

  const id   = `u_${String(deviceId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36)}`;
  const name = username.trim().slice(0, 40).replace(/[<>]/g, '');

  upsertUser(id, name);

  const token = jwt.sign({ userId: id, username: name }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ ok: true, user: { id, username: name }, token });
});

/* GET /api/users/me */
router.get('/me', requireAuth, (req, res) => {
  const user = getUser(req.user.userId);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  return res.json({ ok: true, user });
});

/* GET /api/users/search?q=term — search users by username */
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' }
});
router.get('/search', requireAuth, searchLimiter, (req, res) => {
  const q = (req.query.q || '').trim();
  const db = require('../db');
  if (!q || q.length < 1) {
    const users = db.getAllUsers ? db.getAllUsers(50) : [];
    return res.json({ ok: true, users });
  }
  const safeQ = q.replace(/[%_]/g, '');
  const users = db.searchUsers ? db.searchUsers(safeQ, 20) : [];
  return res.json({ ok: true, users });
});

/* GET /api/users/:id */
router.get('/:id', requireAuth, (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ ok: false });
  // Expose only safe public fields
  return res.json({ ok: true, user: { id: user.id, username: user.username, avatar: user.avatar, status: user.status, last_seen: user.last_seen } });
});

module.exports = router;
