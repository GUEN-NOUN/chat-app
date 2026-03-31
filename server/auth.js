'use strict';

/**
 * server/auth.js — Express router for admin authentication
 *
 * POST /api/auth/login   → returns JWT in HTTP-only cookie
 * POST /api/auth/logout  → clears the cookie
 * GET  /api/auth/me      → returns current admin info (if logged in)
 *
 * Brute-force protected via express-rate-limit on the login route.
 * JWT secret is generated per-server-start (or from env JWT_SECRET).
 */

const express   = require('express');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { findAdmin, verifyPassword } = require('./db');
// Import JWT_SECRET from middleware/auth — single source of truth so admin
// tokens and chat tokens share the same secret and can cross-verify.
const { JWT_SECRET } = require('./middleware/auth');

const router = express.Router();

/* ── JWT config ── */
const JWT_EXPIRES = '2h';
const COOKIE_NAME = 'madarik_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
  maxAge:   2 * 60 * 60 * 1000, // 2 hours
  path:     '/'
};

/* ── Rate limiter: max 10 login attempts per 15 min per IP ── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة.' }
});

/* ═══════════════════════════════════════
   POST /api/auth/login
═══════════════════════════════════════ */
router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'البريد وكلمة المرور مطلوبان' });
  }

  const admin = findAdmin(String(email).trim().toLowerCase());
  if (!admin || !verifyPassword(String(password), admin.password)) {
    return res.status(401).json({ ok: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  return res.json({ ok: true, admin: { email: admin.email, role: admin.role } });
});

/* ═══════════════════════════════════════
   POST /api/auth/logout
═══════════════════════════════════════ */
router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ ok: true });
});

/* ═══════════════════════════════════════
   GET /api/auth/me — verify session
═══════════════════════════════════════ */
router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false, error: 'غير مسجل' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ ok: true, admin: { email: decoded.email, role: decoded.role } });
  } catch {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.status(401).json({ ok: false, error: 'انتهت الجلسة' });
  }
});

/* ═══════════════════════════════════════
   Middleware: requireAuth — REMOVED (duplicate)
   Use require('../middleware/auth').requireAuth instead.
   This avoids having two conflicting auth middlewares.
═══════════════════════════════════════ */

/* ── Rate limiter for chat-token: 5 requests per minute per IP ── */
const chatTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, error: 'محاولات كثيرة. انتظر دقيقة.' }
});

/* ═══════════════════════════════════════
   POST /api/auth/chat-token
   Issues a short-lived JWT for anonymous WS chat users (identified by deviceId).
   This keeps the WS auth handshake server-verified without requiring a password.
═══════════════════════════════════════ */
router.post('/chat-token', chatTokenLimiter, (req, res) => {
  const { deviceId, username } = req.body || {};
  if (!deviceId || typeof deviceId !== 'string' ||
      deviceId.trim().length < 4 || deviceId.length > 200) {
    return res.status(400).json({ ok: false, error: 'deviceId غير صالح أو مفقود' });
  }
  const safeNick = String(username || 'مجهول').trim().slice(0, 50) || 'مجهول';
  const token = jwt.sign(
    { sub: deviceId.trim(), username: safeNick, type: 'chat' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
  return res.json({ ok: true, token });
});

module.exports = { router, COOKIE_NAME };
