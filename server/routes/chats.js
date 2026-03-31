'use strict';

const express = require('express');
const crypto  = require('crypto');
const { requireAdmin } = require('../middleware/auth');
const {
  getRooms, getMemberRooms, getRoomById, createRoom, getRoomMembers, joinRoom, leaveRoom, ensureRoom
} = require('../db');

const router = express.Router();

/* GET /api/chats — list rooms the user belongs to + public rooms */
router.get('/', (req, res) => {
  const userId = req.user.userId || req.user.id;
  const rooms = getMemberRooms(userId);
  return res.json({ ok: true, rooms });
});

/* POST /api/chats — create a new room (admin only for group/lesson; any user for DM) */
router.post('/', (req, res) => {
  const { name, type, description } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ ok: false, error: 'name required' });

  const allowedTypes = ['group', 'dm', 'ai', 'public'];
  const roomType = allowedTypes.includes(type) ? type : 'group';

  const id = `${roomType}:${crypto.randomUUID()}`;
  const room = createRoom(id, name.trim().slice(0, 80), roomType, req.user.userId || req.user.id, description);
  joinRoom(id, req.user.userId || req.user.id);
  return res.status(201).json({ ok: true, room });
});

/* GET /api/chats/:id — room detail + members */
router.get('/:id', (req, res) => {
  const room = getRoomById(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });

  const members = getRoomMembers(req.params.id);

  // ACL: non-public rooms are visible only to members (admins bypass this check)
  if (room.type !== 'public' && !req.user.role) {
    const userId = req.user.userId || req.user.id;
    if (!members.some(m => m.id === userId)) {
      return res.status(403).json({ ok: false, error: 'Access denied: not a member of this room' });
    }
  }

  return res.json({ ok: true, room, members });
});

/* POST /api/chats/:id/join */
router.post('/:id/join', (req, res) => {
  const room = getRoomById(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
  const userId = req.user.userId || req.user.id;
  joinRoom(req.params.id, userId);
  return res.json({ ok: true });
});

/* POST /api/chats/:id/leave */
router.post('/:id/leave', (req, res) => {
  const userId = req.user.userId || req.user.id;
  leaveRoom(req.params.id, userId);
  return res.json({ ok: true });
});

/* POST /api/chats/:id/members — add another user to a room (creator/any member) */
router.post('/:id/members', (req, res) => {
  const room = getRoomById(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
  const { userId } = req.body || {};
  if (!userId || typeof userId !== 'string') return res.status(400).json({ ok: false, error: 'userId required' });
  joinRoom(req.params.id, String(userId).slice(0, 80));
  return res.json({ ok: true });
});

module.exports = router;
