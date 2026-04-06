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
    socket.on('join', async ({ roomId, since } = {}) => {
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

      // On reconnect with `since`, only send new messages; otherwise full page
      if (since && typeof since === 'string') {
        const newMsgs = getMessagesSince(roomId, since, 100);
        const safeMsgs = await annotateMedia(newMsgs);
        socket.emit('history', { roomId, messages: safeMsgs, append: true });
      } else {
        const { messages, hasMore, nextCursor } = getMessagesPaged(roomId, 50);
        const safeMessages = await annotateMedia(messages);
        socket.emit('history', { roomId, messages: safeMessages, hasMore, nextCursor });
      }

      io.to(roomId).emit('presence', {
        userId, status: 'online', roomId,
        onlineCount: roomPresence.get(roomId).size
      });
    });

    /* â”€â”€ MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    socket.on('message', async ({ id: clientId, roomId, type, body, replyTo, agentId, media_url, mime, forceModel } = {}) => {
      if (!roomId || !body) return;

      // Per-message ban check — catches users banned after socket handshake
      if (isUserBanned(userId)) {
        socket.emit('error', { error: 'لقد تم حظرك' });
        socket.disconnect(true);
        return;
      }

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

      // If media_url is absent, treat as plain text regardless of declared type
      const msgType  = cleanMediaUrl
        ? (['image', 'audio', 'video', 'file'].includes(type) ? type : 'file')
        : 'text';
      const serverId = saveMessage(roomId, userId, username, msgType, cleanBody, null, replyTo || null, null, cleanMediaUrl, cleanMime);
      const msg = {
        id: serverId, roomId, senderId: userId, sender: username,
        type: msgType, body: cleanBody, ts: new Date().toISOString(),
        replyTo: replyTo || null,
        ...(cleanMediaUrl ? { media_url: cleanMediaUrl, mime: cleanMime } : {})
      };

      socket.emit('message:ack', { clientId, serverId, ts: msg.ts });
      io.to(roomId).emit('message', msg);

      /* ── AI Workflow Agent ─────────────────────────────────────────────── */
      // Route AI requests through the workflow orchestrator
      if (room.type === 'ai') {
        // Daily AI quota check
        const usage = getAiUsage(userId);
        if (usage >= AI_DAILY_LIMIT) {
          socket.emit('error', { error: `Daily AI limit (${AI_DAILY_LIMIT} requests) reached` });
          return;
        }
        incrementAiUsage(userId);

        const aiMsgId = crypto.randomUUID();
        const sessionId = `${userId}:${roomId}`;

        // Notify sender that AI is thinking BEFORE calling orchestrator
        socket.emit('ai:thinking', { roomId, msgId: aiMsgId });

        try {
          const { runOrchestrator } = require('../../ai-workflow-agent/orchestrator');

          // If image/audio: read file from uploads and prepare base64 for vision/transcription
          let mediaData = null;
          if (['image', 'audio'].includes(msgType) && cleanMediaUrl) {
            try {
              const fname    = path.basename(cleanMediaUrl);
              const fpath    = path.join(__dirname, '..', '..', 'uploads', fname);
              const fbuffer  = await fs.promises.readFile(fpath);
              mediaData = {
                type:     msgType,
                base64:   fbuffer.toString('base64'),
                mimeType: cleanMime || (msgType === 'image' ? 'image/jpeg' : 'audio/webm')
              };
            } catch (readErr) {
              console.warn('[AI] Could not read media file:', readErr.message);
            }
          }

          const result = await runOrchestrator(
            mediaData?.type === 'image' && !cleanBody.startsWith('/uploads/')
              ? cleanBody
              : (mediaData?.type === 'image' ? 'حلل هذه الصورة بالتفصيل' : cleanBody),
            sessionId,
            mediaData,
            typeof forceModel === 'string' ? forceModel : null,
            // Streaming callback — emits each token as it arrives
            (token) => {
              socket.emit('ai:chunk', { msgId: aiMsgId, roomId, token, done: false });
            }
          );
          const agentLabel = `${result.emoji} ${result.model}`;
          // If streamed, output is '' — just send done signal with model info
          const fullText = result.output || '';

          const savedId = saveMessage(
            roomId, 'agent_workflow', agentLabel, 'text',
            result.streamed ? `[streamed via ${result.model}]` : fullText,
            aiMsgId, serverId, 'workflow'
          );
          // done:true with empty token lets the reducer keep the already-accumulated streamed body
          socket.emit('ai:chunk', { msgId: aiMsgId, roomId, token: fullText, done: true, model: result.model, emoji: result.emoji });
          if (!result.streamed) {
            // Non-streamed: broadcast full message to room
            socket.to(roomId).emit('message', {
              id: savedId, roomId,
              senderId: 'agent_workflow', sender: agentLabel,
              type: 'text', body: fullText,
              ts: new Date().toISOString(),
              agentId: 'workflow', agentAvatar: result.emoji, replyTo: serverId
            });
          }
        } catch (err) {
          console.error('AI Workflow error:', err.message);
          const errBody = `⚠️ خطأ في نظام الذكاء الاصطناعي:\n🔍 ${err.message?.slice(0, 150) || 'خطأ غير معروف'}`;
          const errSavedId = saveMessage(
            roomId, 'agent_workflow', '🤖 AI Workflow', 'text',
            errBody, aiMsgId, serverId, 'workflow'
          );
          socket.emit('ai:chunk', { msgId: aiMsgId, roomId, token: errBody, done: true });
          socket.to(roomId).emit('message', {
            id: errSavedId, roomId,
            senderId: 'agent_workflow', sender: '🤖 AI Workflow',
            type: 'text', body: errBody,
            ts: new Date().toISOString(), agentId: 'workflow', replyTo: serverId
          });
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
      // Validate room and membership to prevent cross-room reaction injection
      if (!roomId || typeof roomId !== 'string') return;
      const rxRoom = getRoomById(roomId);
      if (!rxRoom) return;
      if (rxRoom.type !== 'public') {
        const members = getRoomMembers(roomId);
        if (!members.some(m => m.id === userId)) return;
      }
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

