'use strict';

const fs      = require('fs');
const path    = require('path');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getMessages, toggleReaction, getReactions, getBulkReactions, deleteMessage, getMessageById } = require('../db');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

/** M1 — async file-existence check (non-blocking, no event-loop stall) */
async function annotateMedia(messages) {
  if (!Array.isArray(messages)) return messages;
  return Promise.all(messages.map(async m => {
    if (!m.media_url) return m;
    try {
      const filePath = path.join(UPLOAD_DIR, path.basename(m.media_url));
      await fs.promises.access(filePath, fs.constants.F_OK);
      return m;
    } catch {
      return { ...m, media_missing: true };
    }
  }));
}

/* GET /api/messages/:roomId?limit=50&before=<ts> */
router.get('/:roomId', requireAuth, async (req, res) => {
  const { limit, before } = req.query;
  const messages = getMessages(
    req.params.roomId,
    Math.min(Number(limit) || 50, 100),
    before || null
  );

  // M1 — non-blocking media annotation
  const annotated = await annotateMedia(messages);

  // M2 — single bulk query instead of one query per message
  const reactionsMap = getBulkReactions(annotated.map(m => m.id));
  const enriched = annotated.map(m => ({ ...m, reactions: reactionsMap[m.id] || [] }));

  return res.json({ ok: true, messages: enriched });
});

/* POST /api/messages/:messageId/react */
router.post('/:messageId/react', requireAuth, (req, res) => {
  const { emoji } = req.body || {};
  if (!emoji || typeof emoji !== 'string') return res.status(400).json({ ok: false, error: 'emoji required' });
  // Validate emoji is a single grapheme cluster (basic check)
  if (emoji.length > 8) return res.status(400).json({ ok: false, error: 'Invalid emoji' });

  const userId = req.user.userId || req.user.id;
  const result = toggleReaction(req.params.messageId, userId, emoji);
  const reactions = getReactions(req.params.messageId);
  return res.json({ ok: true, ...result, reactions });
});

/* DELETE /api/messages/:messageId */
router.delete('/:messageId', requireAuth, (req, res) => {
  const msg = getMessageById(req.params.messageId);
  if (!msg) return res.status(404).json({ ok: false });
  const userId = req.user.userId || req.user.id;
  // Only sender or admin can delete
  if (msg.sender_id !== userId && !req.user.role) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  deleteMessage(req.params.messageId, userId);
  return res.json({ ok: true });
});

module.exports = router;
