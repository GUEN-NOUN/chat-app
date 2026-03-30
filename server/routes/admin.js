'use strict';
/**
 * server/routes/admin.js
 *
 * Admin-only REST endpoints — all routes require the admin session cookie.
 *
 * GET  /api/admin/stats          — aggregate dashboard statistics
 * GET  /api/admin/users          — paginated user list
 * GET  /api/admin/messages/today — messages sent today (total + per-room)
 * GET  /api/admin/ai/usage       — AI usage per user today
 */

const express       = require('express');
const { requireAdmin } = require('../middleware/auth');
const { db }        = require('../db');

const router = express.Router();

// All admin routes require an admin session
router.use(requireAdmin);

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/admin/stats
   Returns a full snapshot for the dashboard:
   - users: total, online (last 5 min), new today, banned
   - messages: total, today
   - rooms: total, by type
   - ai: requests today, total ever
   - server: uptime, memory
══════════════════════════════════════════════════════════════════════════════ */

/* ── Pre-compiled admin stats queries (compiled once) ── */
const _adminStmts = {
  usersTotal:    db.prepare('SELECT COUNT(*) AS n FROM users'),
  usersOnline:   db.prepare("SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?"),
  usersNewToday: db.prepare("SELECT COUNT(*) AS n FROM users WHERE date(created) = ?"),
  usersBanned:   db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'banned'"),
  usersSuspended: db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
  msgsTotal:     db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE deleted = 0'),
  msgsToday:     db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE date(ts) = ? AND deleted = 0"),
  msgsByRoom:    db.prepare(`SELECT cr.name, cr.type, COUNT(cm.id) AS count
                              FROM chat_messages cm JOIN chat_rooms cr ON cm.room_id = cr.id
                              WHERE date(cm.ts) = ? AND cm.deleted = 0
                              GROUP BY cm.room_id ORDER BY count DESC LIMIT 10`),
  roomsTotal:    db.prepare('SELECT COUNT(*) AS n FROM chat_rooms'),
  roomsPublic:   db.prepare("SELECT COUNT(*) AS n FROM chat_rooms WHERE type = 'public'"),
  roomsDm:       db.prepare("SELECT COUNT(*) AS n FROM chat_rooms WHERE type = 'dm'"),
  roomsGroup:    db.prepare("SELECT COUNT(*) AS n FROM chat_rooms WHERE type = 'group'"),
  roomsAi:       db.prepare("SELECT COUNT(*) AS n FROM chat_rooms WHERE type = 'ai'"),
  aiToday:       db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM ai_usage WHERE date = ?'),
  aiTotal:       db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM ai_usage'),
  aiTopUsers:    db.prepare(`SELECT au.user_id, u.username, au.count FROM ai_usage au
                              LEFT JOIN users u ON au.user_id = u.id
                              WHERE au.date = ? ORDER BY au.count DESC LIMIT 5`),
  recentMsgs:    db.prepare(`SELECT cm.id, cm.room_id, cr.name AS room_name, cm.sender, cm.type, cm.body, cm.ts
                              FROM chat_messages cm LEFT JOIN chat_rooms cr ON cm.room_id = cr.id
                              WHERE cm.deleted = 0 ORDER BY cm.ts DESC LIMIT ?`),
  banUser:       db.prepare("UPDATE users SET status = 'banned' WHERE id = ?"),
  suspendUser:   db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?"),
  unbanUser:     db.prepare("UPDATE users SET status = 'active' WHERE id = ?"),
  deleteMsg:     db.prepare('UPDATE chat_messages SET deleted = 1 WHERE id = ?'),
};

/* ── Gather all stats in a single implicit transaction (faster reads) ── */
const _getStats = db.transaction((today, fiveMinAgo) => ({
  users: {
    total:     _adminStmts.usersTotal.get().n,
    online:    _adminStmts.usersOnline.get(fiveMinAgo).n,
    newToday:  _adminStmts.usersNewToday.get(today).n,
    banned:    _adminStmts.usersBanned.get().n,
    suspended: _adminStmts.usersSuspended.get().n,
  },
  messages: {
    total:  _adminStmts.msgsTotal.get().n,
    today:  _adminStmts.msgsToday.get(today).n,
    byRoom: _adminStmts.msgsByRoom.all(today),
  },
  rooms: {
    total:  _adminStmts.roomsTotal.get().n,
    public: _adminStmts.roomsPublic.get().n,
    dm:     _adminStmts.roomsDm.get().n,
    group:  _adminStmts.roomsGroup.get().n,
    ai:     _adminStmts.roomsAi.get().n,
  },
  ai: {
    requestsToday: _adminStmts.aiToday.get(today).n,
    requestsTotal: _adminStmts.aiTotal.get().n,
    topUsersToday: _adminStmts.aiTopUsers.all(today),
  },
}));

router.get('/stats', (req, res) => {
  try {
    const today      = new Date().toISOString().slice(0, 10);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const stats = _getStats(today, fiveMinAgo);
    stats.server = {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMB:      Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion:   process.version,
      env:           process.env.NODE_ENV || 'development',
    };
    stats.ts = new Date().toISOString();

    res.json({ ok: true, stats });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/admin/users?limit=50&offset=0&status=&q=
══════════════════════════════════════════════════════════════════════════════ */
router.get('/users', (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const status = req.query.status || '';
    const q      = (req.query.q || '').trim().replace(/[%_]/g, '');

    let sql    = 'SELECT id, username, avatar, status, last_seen, created FROM users';
    const args = [];
    const where = [];

    if (status) { where.push('status = ?'); args.push(status); }
    if (q)      { where.push('username LIKE ?'); args.push(`%${q}%`); }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY last_seen DESC LIMIT ? OFFSET ?';
    args.push(limit, offset);

    const users = db.prepare(sql).all(...args);
    const total = db.prepare(
      'SELECT COUNT(*) AS n FROM users' + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    ).get(...args.slice(0, -2)).n;

    res.json({ ok: true, users, total, limit, offset });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch users' });
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/admin/messages/recent?limit=20
══════════════════════════════════════════════════════════════════════════════ */
router.get('/messages/recent', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const msgs  = _adminStmts.recentMsgs.all(limit);
    res.json({ ok: true, messages: msgs });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to fetch messages' });
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/admin/users/:id/ban     { reason }
   POST /api/admin/users/:id/suspend { reason, until }
   POST /api/admin/users/:id/unban
══════════════════════════════════════════════════════════════════════════════ */
router.post('/users/:id/ban', (req, res) => {
  _adminStmts.banUser.run(req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/suspend', (req, res) => {
  _adminStmts.suspendUser.run(req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/unban', (req, res) => {
  _adminStmts.unbanUser.run(req.params.id);
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════════════════
   DELETE /api/admin/messages/:id
══════════════════════════════════════════════════════════════════════════════ */
router.delete('/messages/:id', (req, res) => {
  _adminStmts.deleteMsg.run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
