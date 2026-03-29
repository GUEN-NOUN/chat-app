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

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
  CREATE INDEX IF NOT EXISTS idx_members_room ON room_members(room_id);
  CREATE INDEX IF NOT EXISTS idx_receipts     ON read_receipts(room_id, user_id);
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

/* ═══════════════════════════════════════
   SEED
═══════════════════════════════════════ */
(function seed() {
  // Admin accounts — use env vars in production
  const seedAdmin = (email, password) => {
    const ex = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
    if (!ex) {
      db.prepare('INSERT INTO admins (email, password, role) VALUES (?, ?, ?)').run(
        email, bcrypt.hashSync(password, 12), 'superadmin'
      );
    }
  };
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    seedAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  } else {
    seedAdmin('achraf1258@gmail.com', 'achraf1258');
  }

  // Default public room
  const pub = db.prepare('SELECT id FROM chat_rooms WHERE id = ?').get('public');
  if (!pub) {
    db.prepare('INSERT INTO chat_rooms (id, name, description, type) VALUES (?, ?, ?, ?)').run(
      'public', 'الدردشة العامة', 'غرفة الدردشة العامة', 'public'
    );
  }

  // Delete any existing fake seed messages from previous runs
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
  const agentExists = db.prepare('SELECT id FROM ai_agents WHERE id = ?');
  const insertAgent = db.prepare(
    'INSERT INTO ai_agents (id, name, description, avatar, provider, model, system_prompt, api_key_env, capabilities) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const updateAgentModel = db.prepare('UPDATE ai_agents SET model = ? WHERE id = ?');
  for (const a of agents) {
    if (!agentExists.get(a.id)) {
      insertAgent.run(a.id, a.name, a.description, a.avatar, a.provider, a.model,
        a.system_prompt, a.api_key_env, a.capabilities);
    } else {
      // Update model in case old version had outdated model IDs
      updateAgentModel.run(a.model, a.id);
    }
  }
})();

/* ═══════════════════════════════════════
   ADMIN HELPERS
═══════════════════════════════════════ */
function findAdmin(email) {
  return db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
}

function verifyPassword(plaintext, hash) {
  return bcrypt.compareSync(plaintext, hash);
}

/* ═══════════════════════════════════════
   USER HELPERS
═══════════════════════════════════════ */
function upsertUser(id, username, avatar) {
  db.prepare(`
    INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username, last_seen=datetime('now')
  `).run(id, username, avatar || '👤');
}

function setUserStatus(id, status) {
  db.prepare("UPDATE users SET status=?, last_seen=datetime('now') WHERE id=?").run(status, id);
}

function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/* ═══════════════════════════════════════
   ROOM HELPERS
═══════════════════════════════════════ */
function ensureRoom(roomId, name, type, description) {
  const ex = db.prepare('SELECT id FROM chat_rooms WHERE id = ?').get(roomId);
  if (!ex) {
    db.prepare('INSERT INTO chat_rooms (id, name, type, description) VALUES (?, ?, ?, ?)').run(
      roomId, name || roomId, type || 'public', description || ''
    );
  }
}

function createRoom(id, name, type, createdBy, description) {
  db.prepare('INSERT INTO chat_rooms (id, name, type, created_by, description) VALUES (?, ?, ?, ?, ?)').run(
    id, name, type || 'group', createdBy, description || ''
  );
  return db.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(id);
}

function getRooms() {
  return db.prepare('SELECT * FROM chat_rooms ORDER BY created DESC').all();
}

/** Return only rooms the user belongs to (or public rooms) */
function getMemberRooms(userId) {
  return db.prepare(`
    SELECT DISTINCT cr.* FROM chat_rooms cr
    LEFT JOIN room_members rm ON cr.id = rm.room_id AND rm.user_id = ?
    WHERE cr.type = 'public' OR rm.user_id = ?
    ORDER BY cr.created DESC
  `).all(userId, userId);
}

function getRoomById(id) {
  return db.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(id);
}

function joinRoom(roomId, userId) {
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)').run(roomId, userId);
}

function leaveRoom(roomId, userId) {
  db.prepare('DELETE FROM room_members WHERE room_id=? AND user_id=?').run(roomId, userId);
}

function getRoomMembers(roomId) {
  return db.prepare(`
    SELECT u.* FROM users u
    JOIN room_members rm ON u.id = rm.user_id
    WHERE rm.room_id = ?
  `).all(roomId);
}

/* ═══════════════════════════════════════
   MESSAGE HELPERS
═══════════════════════════════════════ */
function saveMessage(roomId, senderId, senderName, type, body, msgId, replyTo, agentId, mediaUrl, mime) {
  const id = msgId || require('crypto').randomUUID();
  db.prepare(`
    INSERT INTO chat_messages (id, room_id, sender_id, sender, type, body, reply_to, agent_id, media_url, mime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, roomId, senderId, senderName, type || 'text', body, replyTo || null, agentId || null, mediaUrl || null, mime || null);
  return id;
}

function getMessages(roomId, limit, before) {
  if (before) {
    return db.prepare(
      'SELECT * FROM chat_messages WHERE room_id=? AND ts < ? AND deleted=0 ORDER BY ts DESC LIMIT ?'
    ).all(roomId, before, limit || 50).reverse();
  }
  return db.prepare(
    'SELECT * FROM chat_messages WHERE room_id=? AND deleted=0 ORDER BY ts DESC LIMIT ?'
  ).all(roomId, limit || 50).reverse();
}

function getMessagesSince(roomId, afterTs, limit) {
  return db.prepare(
    'SELECT * FROM chat_messages WHERE room_id=? AND ts > ? AND deleted=0 ORDER BY ts ASC LIMIT ?'
  ).all(roomId, afterTs || '1970-01-01', limit || 100);
}

/** Cursor-based paged query. Returns { messages, hasMore, nextCursor }. */
function getMessagesPaged(roomId, limit, before) {
  const pageSize = Math.min(limit || 50, 100);
  let rows;
  if (before) {
    rows = db.prepare(
      'SELECT * FROM chat_messages WHERE room_id=? AND ts < ? AND deleted=0 ORDER BY ts DESC LIMIT ?'
    ).all(roomId, before, pageSize + 1);
  } else {
    rows = db.prepare(
      'SELECT * FROM chat_messages WHERE room_id=? AND deleted=0 ORDER BY ts DESC LIMIT ?'
    ).all(roomId, pageSize + 1);
  }
  const hasMore   = rows.length > pageSize;
  const messages  = rows.slice(0, pageSize).reverse();
  const nextCursor = hasMore && messages.length > 0 ? messages[0].ts : null;
  return { messages, hasMore, nextCursor };
}

function getMessageById(id) {
  return db.prepare('SELECT * FROM chat_messages WHERE id=?').get(id);
}

function updateMessageState(id, state) {
  db.prepare("UPDATE chat_messages SET delivery_state=? WHERE id=?").run(state, id);
}

function deleteMessage(id, userId) {
  db.prepare("UPDATE chat_messages SET deleted=1, body='[تم حذف هذه الرسالة]' WHERE id=? AND sender_id=?").run(id, userId);
}

/* ═══════════════════════════════════════
   REACTION HELPERS
═══════════════════════════════════════ */
function toggleReaction(messageId, userId, emoji) {
  const ex = db.prepare('SELECT id FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').get(messageId, userId, emoji);
  if (ex) {
    db.prepare('DELETE FROM reactions WHERE id=?').run(ex.id);
    return { added: false };
  }
  db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(messageId, userId, emoji);
  return { added: true };
}

function getReactions(messageId) {
  return db.prepare('SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as users FROM reactions WHERE message_id=? GROUP BY emoji').all(messageId);
}

/* ═══════════════════════════════════════
   READ RECEIPT HELPERS
═══════════════════════════════════════ */
function markRead(roomId, userId, messageId) {
  db.prepare(`
    INSERT INTO read_receipts (room_id, user_id, last_read_id, ts) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(room_id, user_id) DO UPDATE SET last_read_id=excluded.last_read_id, ts=excluded.ts
  `).run(roomId, userId, messageId);
}

/* ═══════════════════════════════════════
   AI USAGE HELPERS (daily quota)
═══════════════════════════════════════ */
function getAiUsage(userId) {
  const date = new Date().toISOString().slice(0, 10);
  const row  = db.prepare('SELECT count FROM ai_usage WHERE user_id=? AND date=?').get(userId, date);
  return row ? row.count : 0;
}

function incrementAiUsage(userId) {
  const date = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO ai_usage (user_id, date, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
  `).run(userId, date);
}

/* ═══════════════════════════════════════
   AI AGENT HELPERS
═══════════════════════════════════════ */
function getAgents(activeOnly = true) {
  if (activeOnly) return db.prepare('SELECT * FROM ai_agents WHERE active=1 ORDER BY created').all();
  return db.prepare('SELECT * FROM ai_agents ORDER BY created').all();
}

function getAgentById(id) {
  return db.prepare('SELECT * FROM ai_agents WHERE id=?').get(id);
}

function createAgent(agent) {
  db.prepare(`
    INSERT INTO ai_agents (id, name, description, avatar, provider, model, system_prompt, api_key_env, capabilities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(agent.id, agent.name, agent.description, agent.avatar, agent.provider,
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
  db.prepare('DELETE FROM ai_agents WHERE id=?').run(id);
}

/* ═══════════════════════════════════════
   USER SEARCH
═══════════════════════════════════════ */
function searchUsers(query, limit) {
  return db.prepare(
    'SELECT id, username, avatar, status, last_seen FROM users WHERE username LIKE ? LIMIT ?'
  ).all(`%${query}%`, limit || 20);
}

function getAllUsers(limit) {
  return db.prepare('SELECT id, username, avatar, status, last_seen FROM users ORDER BY last_seen DESC LIMIT ?').all(limit || 50);
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
  getAgents, getAgentById, createAgent, updateAgent, deleteAgent
};
