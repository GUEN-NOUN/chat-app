'use strict';

/**
 * server/db.js — SQLite database layer (better-sqlite3)
 * Extended schema: users, rooms, messages, reactions,
 *                  read_receipts, ai_agents, room_members
 */

const path     = require('path');
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

const DB_PATH = path.join(__dirname, 'madarik.db');
const db      = new Database(DB_PATH);

/* ── SQLite performance tuning ── */
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');   // safe with WAL, 2-3× faster writes
db.pragma('cache_size = -8000');     // 8 MB page cache (default ~2 MB)
db.pragma('temp_store = MEMORY');    // temp tables/indexes in RAM
db.pragma('mmap_size = 67108864');   // memory-map up to 64 MB for faster reads

/* ═══════════════════════════════════════
   SCHEMA
═══════════════════════════════════════ */
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    email    TEXT    UNIQUE NOT NULL,
    password TEXT    NOT NULL,
    role     TEXT    DEFAULT 'superadmin',
    created  TEXT    DEFAULT (datetime('now'))
  );

  -- All chat participants (non-admin users)
  CREATE TABLE IF NOT EXISTS users (
    id        TEXT PRIMARY KEY,
    username  TEXT NOT NULL,
    avatar    TEXT DEFAULT '👤',
    status    TEXT DEFAULT 'offline',
    last_seen TEXT DEFAULT (datetime('now')),
    created   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_rooms (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    avatar      TEXT DEFAULT '💬',
    type        TEXT DEFAULT 'public',
    created_by  TEXT,
    created     TEXT DEFAULT (datetime('now'))
  );

  -- Many-to-many: users <-> rooms
  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role    TEXT DEFAULT 'member',
    joined  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id         TEXT PRIMARY KEY,
    room_id    TEXT NOT NULL,
    sender_id  TEXT NOT NULL,
    sender     TEXT NOT NULL,
    type       TEXT DEFAULT 'text',
    body       TEXT NOT NULL,
    reply_to   TEXT,
    agent_id   TEXT,
    ts         TEXT DEFAULT (datetime('now')),
    edited     INTEGER DEFAULT 0,
    deleted    INTEGER DEFAULT 0,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    ts         TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS read_receipts (
    room_id      TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    last_read_id TEXT,
    ts           TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, user_id)
  );

  -- AI Agent marketplace
  CREATE TABLE IF NOT EXISTS ai_agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT,
    avatar        TEXT DEFAULT '🤖',
    provider      TEXT NOT NULL,
    model         TEXT,
    system_prompt TEXT,
    api_key_env   TEXT,
    capabilities  TEXT DEFAULT '[]',
    active        INTEGER DEFAULT 1,
    created       TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_msg_room     ON chat_messages(room_id, ts);
  CREATE INDEX IF NOT EXISTS idx_msg_sender   ON chat_messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_msg_deleted  ON chat_messages(room_id, deleted);
  CREATE INDEX IF NOT EXISTS idx_members_room ON room_members(room_id);
  CREATE INDEX IF NOT EXISTS idx_members_user ON room_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_receipts     ON read_receipts(room_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_users_seen   ON users(last_seen);
  CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);

  CREATE TABLE IF NOT EXISTS orientation_announcements (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

/* ── Non-destructive migrations ── */
// chat_rooms
try { db.exec("ALTER TABLE chat_rooms ADD COLUMN description TEXT");          } catch { /* exists */ }
try { db.exec("ALTER TABLE chat_rooms ADD COLUMN avatar TEXT DEFAULT '💬'");  } catch { /* exists */ }
try { db.exec("ALTER TABLE chat_rooms ADD COLUMN created_by TEXT");           } catch { /* exists */ }
// chat_messages — guard against old INTEGER id schema
{
  const idColType = db.prepare("PRAGMA table_info(chat_messages)").all().find(c => c.name === 'id')?.type;
  if (idColType && idColType !== 'TEXT') {
    // Old schema had INTEGER AUTOINCREMENT id — recreate with TEXT UUID id (no data loss: 0 rows expected)
    db.exec('DROP TABLE IF EXISTS chat_messages');
    db.exec(`
      CREATE TABLE chat_messages (
        id             TEXT PRIMARY KEY,
        room_id        TEXT NOT NULL,
        sender_id      TEXT NOT NULL,
        sender         TEXT NOT NULL,
        type           TEXT DEFAULT 'text',
        body           TEXT NOT NULL,
        reply_to       TEXT,
        agent_id       TEXT,
        ts             TEXT DEFAULT (datetime('now')),
        delivery_state TEXT DEFAULT 'sent',
        media_url      TEXT,
        mime           TEXT,
        edited         INTEGER DEFAULT 0,
        deleted        INTEGER DEFAULT 0,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_msg_room ON chat_messages(room_id, ts)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_msg_sender ON chat_messages(sender_id)');
  }
}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN reply_to TEXT");          } catch { /* exists */ }
try { db.exec("ALTER TABLE chat_messages ADD COLUMN agent_id TEXT");          } catch { /* exists */ }
try { db.exec("ALTER TABLE chat_messages ADD COLUMN delivery_state TEXT DEFAULT 'sent'"); } catch { /* exists */ }
try { db.exec("ALTER TABLE chat_messages ADD COLUMN media_url TEXT"); }                    catch { /* exists */ }
try { db.exec("ALTER TABLE chat_messages ADD COLUMN mime TEXT"); }                        catch { /* exists */ }
try { db.exec("ALTER TABLE chat_messages ADD COLUMN edited INTEGER DEFAULT 0"); }         catch { /* exists */ }
try { db.exec("ALTER TABLE chat_messages ADD COLUMN deleted INTEGER DEFAULT 0"); }        catch { /* exists */ }
try {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
    user_id TEXT NOT NULL,
    date    TEXT NOT NULL,
    count   INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, date)
  )`);
} catch { /* exists */ }

/* ── Ban system migration ── */
try { db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0"); } catch { /* exists */ }
try { db.exec("CREATE INDEX IF NOT EXISTS idx_users_banned ON users(is_banned)"); } catch { /* exists */ }

/* ═══════════════════════════════════════
   PRE-COMPILED PREPARED STATEMENTS
   (compiled once at startup — ~10× faster than db.prepare() per call)
═══════════════════════════════════════ */
const _stmts = {
  // Admin
  findAdmin:       db.prepare('SELECT * FROM admins WHERE email = ?'),
  adminExists:     db.prepare('SELECT id FROM admins WHERE email = ?'),
  insertAdmin:     db.prepare('INSERT INTO admins (email, password, role) VALUES (?, ?, ?)'),

  // Users
  upsertUser:      db.prepare(`INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)
                                ON CONFLICT(id) DO UPDATE SET username=excluded.username, last_seen=datetime('now')`),
  setUserStatus:   db.prepare("UPDATE users SET status=?, last_seen=datetime('now') WHERE id=?"),
  getUser:         db.prepare('SELECT * FROM users WHERE id = ?'),
  searchUsers:     db.prepare('SELECT id, username, avatar, status, last_seen FROM users WHERE username LIKE ? LIMIT ?'),
  getAllUsers:      db.prepare('SELECT id, username, avatar, status, last_seen FROM users ORDER BY last_seen DESC LIMIT ?'),

  // Rooms
  roomExists:      db.prepare('SELECT id FROM chat_rooms WHERE id = ?'),
  insertRoom:      db.prepare('INSERT INTO chat_rooms (id, name, type, description) VALUES (?, ?, ?, ?)'),
  createRoom:      db.prepare('INSERT INTO chat_rooms (id, name, type, created_by, description) VALUES (?, ?, ?, ?, ?)'),
  getRoomById:     db.prepare('SELECT * FROM chat_rooms WHERE id = ?'),
  getRooms:        db.prepare('SELECT * FROM chat_rooms ORDER BY created DESC'),
  getMemberRooms:  db.prepare(`SELECT DISTINCT cr.* FROM chat_rooms cr
                                LEFT JOIN room_members rm ON cr.id = rm.room_id AND rm.user_id = ?
                                WHERE cr.type = 'public' OR rm.user_id = ?
                                ORDER BY cr.created DESC`),
  joinRoom:        db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)'),
  leaveRoom:       db.prepare('DELETE FROM room_members WHERE room_id=? AND user_id=?'),
  getRoomMembers:  db.prepare(`SELECT u.* FROM users u
                                JOIN room_members rm ON u.id = rm.user_id
                                WHERE rm.room_id = ?`),

  // Messages
  insertMessage:   db.prepare(`INSERT INTO chat_messages (id, room_id, sender_id, sender, type, body, reply_to, agent_id, media_url, mime)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  getMsgBefore:    db.prepare('SELECT * FROM chat_messages WHERE room_id=? AND ts < ? AND deleted=0 ORDER BY ts DESC LIMIT ?'),
  getMsgLatest:    db.prepare('SELECT * FROM chat_messages WHERE room_id=? AND deleted=0 ORDER BY ts DESC LIMIT ?'),
  getMsgSince:     db.prepare('SELECT * FROM chat_messages WHERE room_id=? AND ts > ? AND deleted=0 ORDER BY ts ASC LIMIT ?'),
  getMsgById:      db.prepare('SELECT * FROM chat_messages WHERE id=?'),
  updateMsgState:  db.prepare('UPDATE chat_messages SET delivery_state=? WHERE id=?'),
  deleteMsg:       db.prepare("UPDATE chat_messages SET deleted=1, body='[تم حذف هذه الرسالة]' WHERE id=? AND sender_id=?"),

  // Reactions
  getReaction:     db.prepare('SELECT id FROM reactions WHERE message_id=? AND user_id=? AND emoji=?'),
  deleteReaction:  db.prepare('DELETE FROM reactions WHERE id=?'),
  insertReaction:  db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'),
  getReactions:    db.prepare('SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as users FROM reactions WHERE message_id=? GROUP BY emoji'),

  // Read receipts
  markRead:        db.prepare(`INSERT INTO read_receipts (room_id, user_id, last_read_id, ts) VALUES (?, ?, ?, datetime('now'))
                                ON CONFLICT(room_id, user_id) DO UPDATE SET last_read_id=excluded.last_read_id, ts=excluded.ts`),

  // AI usage
  getAiUsage:      db.prepare('SELECT count FROM ai_usage WHERE user_id=? AND date=?'),
  incrementAiUsage: db.prepare(`INSERT INTO ai_usage (user_id, date, count) VALUES (?, ?, 1)
                                 ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`),

  // Agents
  getActiveAgents: db.prepare('SELECT * FROM ai_agents WHERE active=1 ORDER BY created'),
  getAllAgents:    db.prepare('SELECT * FROM ai_agents ORDER BY created'),
  getAgentById:    db.prepare('SELECT * FROM ai_agents WHERE id=?'),
  insertAgent:     db.prepare(`INSERT INTO ai_agents (id, name, description, avatar, provider, model, system_prompt, api_key_env, capabilities)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  deleteAgent:     db.prepare('DELETE FROM ai_agents WHERE id=?'),
  updateAgentModel: db.prepare('UPDATE ai_agents SET model = ? WHERE id = ?'),

  // Orientation announcements
  insertOrientation:    db.prepare('INSERT INTO orientation_announcements (id, title, body, created_by) VALUES (?, ?, ?, ?)'),
  getOrientations:      db.prepare('SELECT * FROM orientation_announcements ORDER BY created_at DESC LIMIT ?'),
  getOrientationById:   db.prepare('SELECT * FROM orientation_announcements WHERE id = ?'),
  deleteOrientation:    db.prepare('DELETE FROM orientation_announcements WHERE id = ?'),

  // Ban system
  banUserById:    db.prepare('UPDATE users SET is_banned = 1, status = ? WHERE id = ?'),
  unbanUserById:  db.prepare("UPDATE users SET is_banned = 0, status = 'offline' WHERE id = ?"),
  checkBanned:    db.prepare('SELECT is_banned FROM users WHERE id = ?'),
};

/* ═══════════════════════════════════════
   SEED (wrapped in transaction for speed)
═══════════════════════════════════════ */
db.transaction(() => {
  // Admin accounts
  const seedAdmin = (email, password) => {
    if (!_stmts.adminExists.get(email)) {
      _stmts.insertAdmin.run(email, bcrypt.hashSync(password, 12), 'superadmin');
    }
  };
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    seedAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  } else if (process.env.NODE_ENV !== 'production') {
    // Dev/test fallback — NEVER runs in production
    seedAdmin('achraf1258@gmail.com', 'achraf1258');
  } else {
    console.warn('[SECURITY] No ADMIN_EMAIL/ADMIN_PASSWORD set in production — skipping default admin seed.');
    console.warn('   Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment to create an admin account.');
  }

  // Default public room
  if (!_stmts.roomExists.get('public')) {
    _stmts.insertRoom.run('public', 'الدردشة العامة', 'public', 'غرفة الدردشة العامة');
  }

  // Cleanup old fake seed messages
  try {
    db.prepare("DELETE FROM chat_messages WHERE sender_id IN ('seed_teacher','seed_system')").run();
  } catch { /* ignore */ }

  // Default AI agents
  const agents = [
    {
      id: 'agent-auto', name: 'مساعد ذكي', description: 'يختار أفضل وكيل تلقائياً حسب سؤالك',
      avatar: '🎯', provider: 'auto', model: '',
      system_prompt: 'أنت مساعد ذكي يختار الوكيل الأنسب تلقائياً.',
      api_key_env: '', capabilities: '["text","code","math","analysis","creative"]'
    },
    {
      id: 'agent-gpt', name: 'GPT Assistant', description: 'مساعد AI مدعوم بـ ChatGPT',
      avatar: '🤖', provider: 'openai', model: 'gpt-4o-mini',
      system_prompt: 'أنت مساعد تعليمي مفيد يتحدث العربية. تخصصك مساعدة الطلاب المغاربة في دراستهم.',
      api_key_env: 'OPENAI_API_KEY', capabilities: '["text","code","math","analysis"]'
    },
    {
      id: 'agent-gemini', name: 'Gemini Pro', description: 'مساعد AI مدعوم بـ Google Gemini',
      avatar: '✨', provider: 'gemini', model: 'gemini-1.5-flash',
      system_prompt: 'أنت مساعد تعليمي مفيد يتحدث العربية والفرنسية. تخصصك مساعدة الطلاب.',
      api_key_env: 'GEMINI_API_KEY', capabilities: '["text","reasoning","creative","multilingual"]'
    },
    {
      id: 'agent-gemini-free', name: 'Gemini Flash (مجاني)', description: 'مساعد AI مجاني عبر OpenRouter',
      avatar: '⚡', provider: 'openrouter', model: 'openrouter/free',
      system_prompt: 'أنت مساعد تعليمي مفيد يتحدث العربية. تخصصك مساعدة الطلاب المغاربة في دراستهم.',
      api_key_env: 'OPENROUTER_API_KEY', capabilities: '["text","reasoning","creative","multilingual"]'
    },
    {
      id: 'agent-deepseek-free', name: 'DeepSeek (مجاني)', description: 'مساعد AI مجاني للبرمجة والرياضيات',
      avatar: '🧠', provider: 'openrouter', model: 'openai/gpt-oss-120b:free',
      system_prompt: 'أنت مساعد تعليمي مفيد يتحدث العربية. تخصصك مساعدة الطلاب في الرياضيات والبرمجة.',
      api_key_env: 'OPENROUTER_API_KEY', capabilities: '["text","code","math","analysis"]'
    },
    {
      id: 'agent-llama-free', name: 'Llama (مجاني)', description: 'مساعد AI مجاني من Meta',
      avatar: '🦙', provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free',
      system_prompt: 'أنت مساعد تعليمي مفيد يتحدث العربية. تخصصك مساعدة الطلاب.',
      api_key_env: 'OPENROUTER_API_KEY', capabilities: '["text","reasoning","creative"]'
    }
  ];
  for (const a of agents) {
    if (!_stmts.getAgentById.get(a.id)) {
      _stmts.insertAgent.run(a.id, a.name, a.description, a.avatar, a.provider, a.model,
        a.system_prompt, a.api_key_env, a.capabilities);
    } else {
      _stmts.updateAgentModel.run(a.model, a.id);
    }
  }
})();

/* ═══════════════════════════════════════
   ADMIN HELPERS
═══════════════════════════════════════ */
function findAdmin(email) {
  return _stmts.findAdmin.get(email);
}

function verifyPassword(plaintext, hash) {
  return bcrypt.compareSync(plaintext, hash);
}

/* ═══════════════════════════════════════
   USER HELPERS
═══════════════════════════════════════ */
function upsertUser(id, username, avatar) {
  _stmts.upsertUser.run(id, username, avatar || '👤');
}

function setUserStatus(id, status) {
  _stmts.setUserStatus.run(status, id);
}

function getUser(id) {
  return _stmts.getUser.get(id);
}

/* ═══════════════════════════════════════
   ROOM HELPERS
═══════════════════════════════════════ */
function ensureRoom(roomId, name, type, description) {
  if (!_stmts.roomExists.get(roomId)) {
    _stmts.insertRoom.run(roomId, name || roomId, type || 'public', description || '');
  }
}

function createRoom(id, name, type, createdBy, description) {
  _stmts.createRoom.run(id, name, type || 'group', createdBy, description || '');
  return _stmts.getRoomById.get(id);
}

function getRooms() {
  return _stmts.getRooms.all();
}

function getMemberRooms(userId) {
  return _stmts.getMemberRooms.all(userId, userId);
}

function getRoomById(id) {
  return _stmts.getRoomById.get(id);
}

function joinRoom(roomId, userId) {
  _stmts.joinRoom.run(roomId, userId);
}

function leaveRoom(roomId, userId) {
  _stmts.leaveRoom.run(roomId, userId);
}

function getRoomMembers(roomId) {
  return _stmts.getRoomMembers.all(roomId);
}

/* ═══════════════════════════════════════
   MESSAGE HELPERS
═══════════════════════════════════════ */
function saveMessage(roomId, senderId, senderName, type, body, msgId, replyTo, agentId, mediaUrl, mime) {
  const id = msgId || crypto.randomUUID();
  _stmts.insertMessage.run(id, roomId, senderId, senderName, type || 'text', body, replyTo || null, agentId || null, mediaUrl || null, mime || null);
  return id;
}

function getMessages(roomId, limit, before) {
  if (before) {
    return _stmts.getMsgBefore.all(roomId, before, limit || 50).reverse();
  }
  return _stmts.getMsgLatest.all(roomId, limit || 50).reverse();
}

function getMessagesSince(roomId, afterTs, limit) {
  return _stmts.getMsgSince.all(roomId, afterTs || '1970-01-01', limit || 100);
}

function getMessagesPaged(roomId, limit, before) {
  const pageSize = Math.min(limit || 50, 100);
  const rows = before
    ? _stmts.getMsgBefore.all(roomId, before, pageSize + 1)
    : _stmts.getMsgLatest.all(roomId, pageSize + 1);
  const hasMore   = rows.length > pageSize;
  const messages  = rows.slice(0, pageSize).reverse();
  const nextCursor = hasMore && messages.length > 0 ? messages[0].ts : null;
  return { messages, hasMore, nextCursor };
}

function getMessageById(id) {
  return _stmts.getMsgById.get(id);
}

function updateMessageState(id, state) {
  _stmts.updateMsgState.run(state, id);
}

function deleteMessage(id, userId) {
  _stmts.deleteMsg.run(id, userId);
}

/* ═══════════════════════════════════════
   REACTION HELPERS
═══════════════════════════════════════ */
function toggleReaction(messageId, userId, emoji) {
  const ex = _stmts.getReaction.get(messageId, userId, emoji);
  if (ex) {
    _stmts.deleteReaction.run(ex.id);
    return { added: false };
  }
  _stmts.insertReaction.run(messageId, userId, emoji);
  return { added: true };
}

function getReactions(messageId) {
  return _stmts.getReactions.all(messageId);
}

/**
 * M2 — bulk reactions for a list of message IDs.
 * Returns a map: { [messageId]: [{ emoji, count, users }] }
 * One query instead of N queries.
 */
function getBulkReactions(messageIds) {
  if (!messageIds || messageIds.length === 0) return {};
  const placeholders = messageIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT message_id, emoji, COUNT(*) AS count, GROUP_CONCAT(user_id) AS users
     FROM reactions WHERE message_id IN (${placeholders})
     GROUP BY message_id, emoji`
  ).all(...messageIds);
  const map = {};
  for (const row of rows) {
    if (!map[row.message_id]) map[row.message_id] = [];
    map[row.message_id].push({ emoji: row.emoji, count: row.count, users: row.users });
  }
  return map;
}

/* ═══════════════════════════════════════
   READ RECEIPT HELPERS
═══════════════════════════════════════ */
function markRead(roomId, userId, messageId) {
  _stmts.markRead.run(roomId, userId, messageId);
}

/* ═══════════════════════════════════════
   AI USAGE HELPERS (daily quota)
═══════════════════════════════════════ */
function getAiUsage(userId) {
  const date = new Date().toISOString().slice(0, 10);
  const row  = _stmts.getAiUsage.get(userId, date);
  return row ? row.count : 0;
}

function incrementAiUsage(userId) {
  const date = new Date().toISOString().slice(0, 10);
  _stmts.incrementAiUsage.run(userId, date);
}

/* ═══════════════════════════════════════
   AI AGENT HELPERS
═══════════════════════════════════════ */
function getAgents(activeOnly = true) {
  return activeOnly ? _stmts.getActiveAgents.all() : _stmts.getAllAgents.all();
}

function getAgentById(id) {
  return _stmts.getAgentById.get(id);
}

function createAgent(agent) {
  _stmts.insertAgent.run(agent.id, agent.name, agent.description, agent.avatar, agent.provider,
    agent.model, agent.system_prompt, agent.api_key_env, agent.capabilities || '[]');
  return getAgentById(agent.id);
}

function updateAgent(id, fields) {
  const allowed = ['name','description','avatar','provider','model','system_prompt','api_key_env','capabilities','active'];
  const sets = Object.keys(fields).filter(k => allowed.includes(k)).map(k => `${k}=?`).join(', ');
  const vals = Object.keys(fields).filter(k => allowed.includes(k)).map(k => fields[k]);
  if (!sets) return;
  db.prepare(`UPDATE ai_agents SET ${sets} WHERE id=?`).run(...vals, id);
}

function deleteAgent(id) {
  _stmts.deleteAgent.run(id);
}

/* ═══════════════════════════════════════
   ORIENTATION ANNOUNCEMENT HELPERS
═══════════════════════════════════════ */
function createOrientation(title, body, createdBy) {
  const id = crypto.randomUUID();
  _stmts.insertOrientation.run(id, title, body, createdBy);
  return _stmts.getOrientationById.get(id);
}

function listOrientations(limit) {
  return _stmts.getOrientations.all(Math.min(limit || 50, 200));
}

function deleteOrientationById(id) {
  _stmts.deleteOrientation.run(id);
}

/* ═══════════════════════════════════════
   BAN SYSTEM HELPERS
═══════════════════════════════════════ */
function banUser(userId) {
  _stmts.banUserById.run('banned', userId);
}

function unbanUser(userId) {
  _stmts.unbanUserById.run(userId);
}

function isUserBanned(userId) {
  const row = _stmts.checkBanned.get(userId);
  return row ? !!row.is_banned : false;
}

/* ═══════════════════════════════════════
   USER SEARCH
═══════════════════════════════════════ */
function searchUsers(query, limit) {
  return _stmts.searchUsers.all(`%${query}%`, limit || 20);
}

function getAllUsers(limit) {
  return _stmts.getAllUsers.all(limit || 50);
}

module.exports = {
  db,
  // Admin
  findAdmin, verifyPassword,
  // Users
  upsertUser, setUserStatus, getUser, searchUsers, getAllUsers,
  // Rooms
  ensureRoom, createRoom, getRooms, getMemberRooms, getRoomById, joinRoom, leaveRoom, getRoomMembers,
  // Messages
  saveMessage, getMessages, getMessagesPaged, getMessagesSince, getMessageById,
  updateMessageState, deleteMessage,
  // Reactions
  toggleReaction, getReactions,
  // Read receipts
  markRead,
  // AI Usage
  getAiUsage, incrementAiUsage,
  // Agents
  getAgents, getAgentById, createAgent, updateAgent, deleteAgent,
  // Reactions (bulk)
  getBulkReactions,
  // Orientation
  createOrientation, listOrientations, deleteOrientationById,
  // Ban system
  banUser, unbanUser, isUserBanned
};
