'use strict';

/**
 * server/routes/orientation.js — Orientation/Announcement board
 *
 * GET  /api/orientation          — any authenticated user (students, teachers)
 * POST /api/orientation          — admin only: publish a new announcement
 * DELETE /api/orientation/:id    — admin only: remove an announcement
 *
 * Storage: orientation_announcements table in SQLite (created by db.js schema).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createOrientation, listOrientations, deleteOrientationById } = require('../db');

const router = express.Router();

/* ── Rate limiter for public GET (prevent enumeration abuse) ── */
const readLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' }
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/orientation?limit=50
   Any authenticated user (chat JWT Bearer OR admin cookie).
══════════════════════════════════════════════════════════════════════════════ */
router.get('/', requireAuth, readLimiter, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const announcements = listOrientations(limit);
  return res.json({ ok: true, announcements });
});

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/orientation
   Admin session cookie required.
   Body: { title: string, body: string }
══════════════════════════════════════════════════════════════════════════════ */
router.post('/', requireAdmin, (req, res) => {
  const { title, body } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim())
    return res.status(400).json({ ok: false, error: 'title is required' });

  if (!body || typeof body !== 'string' || !body.trim())
    return res.status(400).json({ ok: false, error: 'body is required' });

  const createdBy = req.admin?.email || req.admin?.id || 'admin';
  const announcement = createOrientation(
    title.trim().slice(0, 200),
    body.trim().slice(0, 5000),
    createdBy
  );

  return res.status(201).json({ ok: true, announcement });
});

/* ══════════════════════════════════════════════════════════════════════════════
   DELETE /api/orientation/:id
   Admin session cookie required.
══════════════════════════════════════════════════════════════════════════════ */
router.delete('/:id', requireAdmin, (req, res) => {
  deleteOrientationById(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
