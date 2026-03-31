'use strict';

/**
 * server/socket/index.js 
 *
 * Events (client â†’ server):
 *   join        { roomId }
 *   message     { id, roomId, type, body, replyTo?, agentId? }
 *   typing      { roomId }
 *   reaction    { messageId, roomId, emoji }
 *   read        { roomId, messageId }
 *   history     { roomId, before? }
 *   rooms       (no payload)
 *
 * Events (server â†’ client):
 *   auth:ok     { user }
 *   message     { id, roomId, senderId, sender, type, body, ts, agentId?, replyTo? }
 *   message:ack { clientId, serverId, ts }
 *   ai:chunk    { msgId, roomId, token, done }
 *   typing      { roomId, userId, username }
 *   typing:stop { roomId, userId }
 *   reaction    { messageId, roomId, reactions }
 *   presence    { userId, status, roomId?, onlineCount? }
 *   history     { roomId, messages, hasMore, nextCursor, page? }
 *   rooms       { rooms }
 *   error       { error }
 */

const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { verifyToken } = require('../middleware/auth');
const {
  upsertUser, setUserStatus, getUser,
  getRooms, getMemberRooms, getRoomById, ensureRoom, joinRoom, getRoomMembers,
  saveMessage, getMessages, getMessagesPaged, getMessagesSince,
  toggleReaction, getReactions, markRead,
  getAiUsage, incrementAiUsage, isUserBanned
} = require('../db');
const aiService      = require('../services/ai.service');
const { getAgentById } = require('../db');

const TYPING_DEBOUNCE = 3000;
const MSG_WINDOW_MS   = 10_000;   // sliding window
const MSG_WINDOW_MAX  = 10;       // max msgs per window
const AI_DAILY_LIMIT  = Number(process.env.AI_DAILY_LIMIT) || 50;

async function annotateMedia(messages) {
  if (!Array.isArray(messages)) return messages;
  return Promise.all(messages.map(async m => {
    if (!m.media_url) return m;
    try {
      const filename = path.basename(m.media_url);
      const filePath = path.join(__dirname, '..', 'uploads', filename);
      await fs.promises.access(filePath, fs.constants.F_OK);
      return m;
    } catch {
      return { ...m, media_missing: true };
    }
  }));
}

function sanitize(str) {
  return String(str || '').replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;').slice(0, 4000);
}

/** Simple per-socket sliding-window rate limiter. Returns true if allowed. */
function makeRateLimiter(windowMs, max) {
  const timestamps = [];
  return function allow() {
    const now = Date.now();
    // Remove entries outside the window
    while (timestamps.length && now - timestamps[0] > windowMs) timestamps.shift();
    if (timestamps.length >= max) return false;
    timestamps.push(now);
    return true;
  };
}

function attachSocket(io) {
  const roomPresence = new Map(); // roomId â†’ Set<userId>

  /* â”€â”€ Auth middleware (handshake) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Invalid token'));
    if (payload.userId && isUserBanned(payload.userId)) {
      return next(new Error('لقد تم حظرك'));
    }
    socket.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    const { userId, username } = socket.user;

    upsertUser(userId, username);
    setUserStatus(userId, 'online');
    socket.broadcast.emit('presence', { userId, status: 'online' });
    socket.emit('auth:ok', { user: { id: userId, username } });

    // Per-socket message rate limiter
    const allowMessage = makeRateLimiter(MSG_WINDOW_MS, MSG_WINDOW_MAX);

    /* â”€â”€ JOIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('join', async ({ roomId } = {}) => {
      if (!roomId || typeof roomId !== 'string') return;
      const room = getRoomById(roomId);
      if (!room) { socket.emit('error', { error: 'Room not found' }); return; }

      // ACL: block non-members from joining private / group rooms
      if (room.type !== 'public') {
        const members = getRoomMembers(roomId);
        const isMember = members.some(m => m.id === userId);
        if (!isMember) {
          socket.emit('error', { error: 'Access denied: not a member of this room' });
          return;
        }
      }

      socket.join(roomId);
      joinRoom(roomId, userId);

      if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Set());
      roomPresence.get(roomId).add(userId);

      // Send initial history with cursor info and media integrity flags
      const { messages, hasMore, nextCursor } = getMessagesPaged(roomId, 50);
      const safeMessages = await annotateMedia(messages);
      socket.emit('history', { roomId, messages: safeMessages, hasMore, nextCursor });

      io.to(roomId).emit('presence', {
        userId, status: 'online', roomId,
        onlineCount: roomPresence.get(roomId).size
      });
    });

    /* â”€â”€ MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('message', async ({ id: clientId, roomId, type, body, replyTo, agentId, media_url, mime } = {}) => {
      if (!roomId || !body) return;

      // Rate limit
      if (!allowMessage()) {
        socket.emit('error', { error: 'Too many messages. Please slow down.' });
        return;
      }

      const cleanBody = sanitize(body);
      if (!cleanBody) return;

      if (/^data:/i.test(cleanBody)) {
        socket.emit('error', { error: 'Data URIs not allowed. Use /api/upload.' });
        return;
      }

      // Validate media_url — must be a relative /uploads/ path, no external URLs
      const cleanMediaUrl = (media_url && /^\/uploads\/[^/]+$/.test(media_url)) ? media_url : null;
      const cleanMime     = cleanMediaUrl && typeof mime === 'string' ? mime.slice(0, 64) : null;

      const room = getRoomById(roomId);
      if (!room) { socket.emit('error', { error: 'Room not found' }); return; }

      const msgType  = ['text', 'image', 'audio', 'video', 'file'].includes(type) ? type : 'text';
      const serverId = saveMessage(roomId, userId, username, msgType, cleanBody, null, replyTo || null, null, cleanMediaUrl, cleanMime);
      const msg = {
        id: serverId, roomId, senderId: userId, sender: username,
        type: msgType, body: cleanBody, ts: new Date().toISOString(),
        replyTo: replyTo || null,
        ...(cleanMediaUrl ? { media_url: cleanMediaUrl, mime: cleanMime } : {})
      };

      socket.emit('message:ack', { clientId, serverId, ts: msg.ts });
      io.to(roomId).emit('message', msg);

      /* ── AI Agent response ─────────────────────────────────────────────── */
      // Resolve agentId: client value OR room.description fallback for AI rooms
      const resolvedAgentId = agentId || (room.type === 'ai' ? room.description : null);
      if (resolvedAgentId) {
        let agent = getAgentById(resolvedAgentId);
        // Fallback: if agent's API key is missing, try openrouter free agent
        if (agent && !process.env[agent.api_key_env || ''] && agent.provider !== 'auto') {
          const fallback = getAgentById('agent-gemini-free');
          if (fallback?.active && process.env[fallback.api_key_env]) agent = fallback;
        }
        if (!agent?.active) return;

        // Daily AI quota check
        const usage = getAiUsage(userId);
        if (usage >= AI_DAILY_LIMIT) {
          socket.emit('error', { error: `Daily AI limit (${AI_DAILY_LIMIT} requests) reached` });
          return;
        }
        incrementAiUsage(userId);

        const recentHistory = getMessages(roomId, 10).map(m => ({
          role: m.sender_id === `agent_${resolvedAgentId}` ? 'assistant' : 'user',
          content: m.body
        }));

        const aiMsgId  = crypto.randomUUID();
        let   fullText = '';

        try {
          await aiService.streamChat(agent, cleanBody, recentHistory, (token, done) => {
            fullText += token;
            // Stream chunks to requesting socket only
            socket.emit('ai:chunk', { msgId: aiMsgId, roomId, token, done });

            if (done) {
              const savedId = saveMessage(
                roomId, `agent_${resolvedAgentId}`, agent.name, 'text',
                fullText || '…', aiMsgId, serverId, resolvedAgentId
              );
              // Broadcast complete message to room peers (sender already got chunks)
              socket.to(roomId).emit('message', {
                id: savedId, roomId,
                senderId: `agent_${resolvedAgentId}`, sender: agent.name,
                type: 'text', body: fullText,
                ts: new Date().toISOString(),
                agentId: resolvedAgentId, agentAvatar: agent.avatar, replyTo: serverId
              });
            }
          });
        } catch (err) {
          console.error('AI agent error:', err.message);
          // Send error as a visible system message so user sees it in chat
          const errText = err.message?.includes('API key')
            ? 'مفتاح API غير مُعدّ. تواصل مع المسؤول.'
            : 'وكيل الذكاء الاصطناعي غير متاح حالياً. حاول مرة أخرى.';
          socket.emit('ai:chunk', { msgId: aiMsgId, roomId, token: '⚠️ ' + errText, done: true });
        }
      }
    });

    /* â”€â”€ TYPING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const typingTimers = new Map();
    socket.on('typing', ({ roomId } = {}) => {
      if (!roomId) return;
      socket.to(roomId).emit('typing', { roomId, userId, username });
      clearTimeout(typingTimers.get(roomId));
      typingTimers.set(roomId, setTimeout(() => {
        socket.to(roomId).emit('typing:stop', { roomId, userId });
        typingTimers.delete(roomId);
      }, TYPING_DEBOUNCE));
    });

    /* â”€â”€ REACTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('reaction', ({ messageId, roomId, emoji } = {}) => {
      if (!messageId || !emoji || typeof emoji !== 'string' || emoji.length > 32) return;
      toggleReaction(messageId, userId, emoji);
      const reactions = getReactions(messageId);
      io.to(roomId).emit('reaction', { messageId, roomId, reactions });
    });

    /* â”€â”€ READ RECEIPT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('read', ({ roomId, messageId } = {}) => {
      if (!roomId || !messageId) return;
      markRead(roomId, userId, messageId);
      socket.to(roomId).emit('read', { roomId, userId, messageId });
    });

    /* â”€â”€ HISTORY (load-more / cursor pagination) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('history', async ({ roomId, before } = {}) => {
      if (!roomId) return;
      const { messages, hasMore, nextCursor } = getMessagesPaged(roomId, 30, before || null);
      const safeMessages = await annotateMedia(messages);
      socket.emit('history', { roomId, messages: safeMessages, hasMore, nextCursor, page: true });
    });

    /* â”€â”€ ROOMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('rooms', () => {
      socket.emit('rooms', { rooms: getMemberRooms(userId) });
    });

    /* â”€â”€ DISCONNECT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('disconnect', () => {
      setUserStatus(userId, 'offline');
      socket.broadcast.emit('presence', { userId, status: 'offline' });
      for (const [roomId, members] of roomPresence.entries()) {
        if (members.delete(userId)) {
          io.to(roomId).emit('presence', {
            userId, status: 'offline', roomId, onlineCount: members.size
          });
        }
      }
      for (const t of typingTimers.values()) clearTimeout(t);
    });
  });
}

module.exports = { attachSocket };

