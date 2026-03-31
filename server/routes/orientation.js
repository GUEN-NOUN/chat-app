'use strict';

/**
 * server/routes/orientation.js — Orientation/Announcement board
 *
 * GET    /api/orientation           — any authenticated user (students, teachers)
 * POST   /api/orientation           — admin only: publish a new announcement
 * DELETE /api/orientation/:id       — admin only: remove an announcement
 * POST   /api/orientation/summarize — authenticated user: AI-summarize text
 *
 * Storage: orientation_announcements table in SQLite (created by db.js schema).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createOrientation, listOrientations, deleteOrientationById, getAiUsage, incrementAiUsage } = require('../db');
const aiService = require('../services/ai.service');

const router = express.Router();

const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 50;

/* ── Rate limiter for public GET (prevent enumeration abuse) ── */
const readLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' }
});

/* ── Rate limiter for summarize (5 req/min per IP) ── */
const summarizeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'طلبات كثيرة. انتظر دقيقة.' }
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/orientation?limit=50
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

  // Strip HTML tags to prevent XSS
  const safeTitle = title.trim().slice(0, 200).replace(/<[^>]*>/g, '');
  const safeBody  = body.trim().slice(0, 5000).replace(/<[^>]*>/g, '');

  const createdBy = req.admin?.email || req.admin?.id || 'admin';
  const announcement = createOrientation(
    safeTitle,
    safeBody,
    createdBy
  );

  return res.status(201).json({ ok: true, announcement });
});

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/orientation/summarize
   Authenticated user. Uses AI to summarize text into 3 Arabic/Darija bullet points.
   Respects daily AI quota.
   Body: { text: string }
══════════════════════════════════════════════════════════════════════════════ */
router.post('/summarize', requireAuth, summarizeLimiter, async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim())
    return res.status(400).json({ ok: false, error: 'text is required' });

  const userId = req.user.userId || req.user.id;
  const usage = getAiUsage(userId);
  if (usage >= AI_DAILY_LIMIT) {
    return res.status(429).json({ ok: false, error: 'لقد وصلت للحد اليومي من طلبات الذكاء الاصطناعي' });
  }

  const safeText = text.trim().slice(0, 5000).replace(/<[^>]*>/g, '');

  const agent = {
    id: 'orientation-summarizer',
    provider: process.env.GEMINI_API_KEY ? 'gemini' : 'openrouter',
    model: process.env.GEMINI_API_KEY ? 'gemini-1.5-flash' : 'google/gemini-2.0-flash-exp:free',
    system_prompt: 'أنت ملخص تعليمي. لخّص النص التالي في 3 نقاط مختصرة بالعربية أو الدارجة المغربية. استخدم رموز نقطية (•). كن مختصراً ومباشراً.',
    api_key_env: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : 'OPENROUTER_API_KEY'
  };

  try {
    const summary = await aiService.chat(agent, safeText, []);
    incrementAiUsage(userId);
    return res.json({ ok: true, summary });
  } catch (err) {
    console.error('[orientation/summarize]', err.message);
    return res.status(502).json({ ok: false, error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً' });
  }
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
