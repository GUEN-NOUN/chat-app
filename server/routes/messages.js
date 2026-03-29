'use strict';

const fs      = require('fs');
const path    = require('path');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getMessages, toggleReaction, getReactions, deleteMessage, getMessageById } = require('../db');

const router = express.Router();

function annotateMedia(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map(m => {
    if (!m.media_url) return m;
    try {
      const filename = path.basename(m.media_url);
      const filePath = path.join(__dirname, '..', 'uploads', filename);
      if (!fs.existsSync(filePath)) {
        return { ...m, media_missing: true };
      }
    } catch {
      return { ...m, media_missing: true };
    }
    return m;
  });
}

/* GET /api/messages/:roomId?limit=50&before=<ts> */
router.get('/:roomId', requireAuth, (req, res) => {
  const { limit, before } = req.query;
  const messages = getMessages(
    req.params.roomId,
    Math.min(Number(limit) || 50, 100),
    before || null
  );
  // Attach reactions
  const enriched = annotateMedia(messages).map(m => ({
    ...m,
    reactions: getReactions(m.id)
  }));
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
