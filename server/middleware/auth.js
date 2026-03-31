'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET || require('crypto').randomBytes(48).toString('hex');
const COOKIE_NAME = 'madarik_token';

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

/** Require admin session cookie */
function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  const payload = verifyToken(token);
  if (!payload?.role) return res.status(401).json({ ok: false, error: 'Invalid session' });
  req.admin = payload;
  next();
}

/** Require admin OR chat user JWT */
function requireAuth(req, res, next) {
  const bearer  = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const token   = bearer || req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ ok: false, error: 'Invalid token' });
  req.user = payload;
  next();
}

/** Set req.user if token present, but do not block */
function optionalAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const token  = bearer || req.cookies?.[COOKIE_NAME];
  if (token) { const p = verifyToken(token); if (p) req.user = p; }
  next();
}

/** Reject banned users with 403 */
function requireNotBanned(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return next(); // admin tokens don't have userId
  const { isUserBanned } = require('../db');
  if (isUserBanned(userId)) {
    return res.status(403).json({ ok: false, error: 'لقد تم حظرك' });
  }
  next();
}

module.exports = { verifyToken, requireAdmin, requireAuth, optionalAuth, requireNotBanned, JWT_SECRET };
