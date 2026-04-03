import React, {
  createContext, useContext, useReducer, useCallback, useEffect, useRef
} from 'react';
import { getSocket, disconnectSocket } from '../services/socket';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ROOMS':
      return { ...state, rooms: action.rooms };

    case 'SET_ACTIVE_ROOM':
      return { ...state, activeRoomId: action.roomId, typingUsers: {} };

    case 'SET_MESSAGES':
      return { ...state, messages: { ...state.messages, [action.roomId]: action.messages } };

    case 'PREPEND_MESSAGES': {
      const existing = state.messages[action.roomId] || [];
      // De-duplicate by id
      const existingIds = new Set(existing.map(m => m.id));
      const fresh = action.messages.filter(m => !existingIds.has(m.id));
      return { ...state, messages: { ...state.messages, [action.roomId]: [...fresh, ...existing] } };
    }

    // Append new messages to end (used after reconnect to add missed messages)
    case 'APPEND_MESSAGES': {
      const existing = state.messages[action.roomId] || [];
      const existingIds = new Set(existing.map(m => m.id));
      const fresh = action.messages.filter(m => !existingIds.has(m.id));
      if (!fresh.length) return state;
      return { ...state, messages: { ...state.messages, [action.roomId]: [...existing, ...fresh] } };
    }

    case 'ADD_MESSAGE': {
      const msgs = state.messages[action.roomId] || [];
      // Skip if already present (server echo after optimistic add)
      if (msgs.some(m => m.id === action.message.id)) return state;
      return { ...state, messages: { ...state.messages, [action.roomId]: [...msgs, action.message] } };
    }

    // Optimistic confirm: rename clientId â†’ serverId, clear pending flag
    case 'CONFIRM_MESSAGE': {
      const updated = {};
      for (const [rid, msgs] of Object.entries(state.messages)) {
        updated[rid] = msgs.map(m =>
          m.id === action.clientId
            ? { ...m, id: action.serverId, ts: action.ts, pending: false }
            : m
        );
      }
      return { ...state, messages: updated };
    }

    case 'UPDATE_REACTIONS': {
      const msgs = (state.messages[action.roomId] || []).map(m =>
        m.id === action.messageId ? { ...m, reactions: action.reactions } : m
      );
      return { ...state, messages: { ...state.messages, [action.roomId]: msgs } };
    }

    // Streaming AI: create placeholder or append token
    case 'APPEND_AI_CHUNK': {
      const msgs    = state.messages[action.roomId] || [];
      const exists  = msgs.find(m => m.id === action.msgId);
      let nextMsgs;
      if (!exists) {
        nextMsgs = [...msgs, {
          id: action.msgId, roomId: action.roomId,
          sender: 'AI', type: 'text',
          body: action.token, streaming: !action.done,
          ts: new Date().toISOString(), agentId: true
        }];
      } else {
        nextMsgs = msgs.map(m =>
          m.id === action.msgId
            ? { ...m, body: m.body + action.token, streaming: !action.done }
            : m
        );
      }
      return { ...state, messages: { ...state.messages, [action.roomId]: nextMsgs } };
    }

    case 'SET_TYPING': {
      if (action.clear) {
        const { [action.userId]: _, ...rest } = (state.typingUsers[action.roomId] || {});
        return { ...state, typingUsers: { ...state.typingUsers, [action.roomId]: rest } };
      }
      return {
        ...state,
        typingUsers: {
          ...state.typingUsers,
          [action.roomId]: { ...(state.typingUsers[action.roomId] || {}), [action.userId]: action.username }
        }
      };
    }

    case 'SET_PRESENCE':
      return { ...state, presence: { ...state.presence, [action.userId]: action.status } };

    case 'SET_AGENTS':
      return { ...state, agents: action.agents };

    case 'SET_ACTIVE_AGENT':
      return { ...state, activeAgentId: action.agentId };

    case 'SET_CONNECTED':
      return { ...state, connected: action.connected };

    case 'ADD_SYSTEM_ERROR': {
      const msgs = state.messages[action.roomId] || [];
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.roomId]: [...msgs, {
            id: `err_${Date.now()}`, roomId: action.roomId,
            sender: 'النظام', senderId: '__system__',
            type: 'text', body: '⚠️ ' + action.error,
            ts: new Date().toISOString(), system: true
          }]
        }
      };
    }

    case 'SET_HAS_MORE':
      return { ...state, hasMore: { ...state.hasMore, [action.roomId]: action.hasMore },
               nextCursor: { ...state.nextCursor, [action.roomId]: action.nextCursor } };

    default:
      return state;
  }
}

const initialState = {
  rooms:        [],
  activeRoomId: 'public',
  messages:     {},
  typingUsers:  {},
  presence:     {},
  agents:       [],
  activeAgentId: null,
  connected:    false,
  hasMore:      {},
  nextCursor:   {}
};

export function ChatProvider({ children }) {
  const { user, token } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef    = useRef(null);
  const typingTimers = useRef({});
  // Track optimistic clientId → roomId mapping for dedup
  const pendingIds   = useRef(new Set());
  // Store a room join that was requested before socket was ready
  const pendingJoinRef = useRef(null);
  // Always-fresh ref to state (avoids stale closure in reconnect handler)
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  // Immediately fetch rooms via REST — don't wait for socket auth:ok
  useEffect(() => {
    if (!token) return;
    api.getRooms(token).then(res => {
      if (res.ok && res.rooms?.length) {
        dispatch({ type: 'SET_ROOMS', rooms: res.rooms });
      }
    });
  }, [token]);

  useEffect(() => {
    if (!user || !token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('connect',    () => {
      dispatch({ type: 'SET_CONNECTED', connected: true });
      // Flush a pending room join that arrived before socket was ready
      if (pendingJoinRef.current) {
        socket.emit('join', { roomId: pendingJoinRef.current });
        pendingJoinRef.current = null;
      }
    });
    socket.on('disconnect', () => dispatch({ type: 'SET_CONNECTED', connected: false }));

    // On reconnect: re-fetch rooms via REST (reliable) then re-join active room
    socket.io.on('reconnect', () => {
      // REST is more reliable on reconnect than socket event ordering
      if (token) {
        api.getRooms(token).then(res => {
          if (res.ok && res.rooms?.length) dispatch({ type: 'SET_ROOMS', rooms: res.rooms });
        }).catch(() => {});
      }
      socket.emit('rooms');
      // Re-join, passing the last known timestamp so server only sends missed messages
      const activeRoom = stateRef.current?.activeRoomId;
      if (activeRoom) {
        const msgs = stateRef.current.messages[activeRoom];
        const since = msgs?.length ? msgs[msgs.length - 1].ts : null;
        socket.emit('join', { roomId: activeRoom, since });
      }
      if (activeRoom !== 'public') {
        const pubMsgs = stateRef.current.messages['public'];
        const since = pubMsgs?.length ? pubMsgs[pubMsgs.length - 1].ts : null;
        socket.emit('join', { roomId: 'public', since });
      }
    });

    socket.on('auth:ok', () => {
      // Always join the public room first, then any previously active room
      socket.emit('join',  { roomId: 'public' });
      socket.emit('rooms');
      const savedActive = stateRef.current?.activeRoomId;
      if (savedActive && savedActive !== 'public') {
        socket.emit('join', { roomId: savedActive });
      }
    });

    socket.on('rooms', ({ rooms }) => dispatch({ type: 'SET_ROOMS', rooms }));

    socket.on('history', ({ roomId, messages, hasMore, nextCursor, page, append }) => {
      loadingMore.current.delete(roomId);
      dispatch({ type: 'SET_HAS_MORE', roomId, hasMore: !!hasMore, nextCursor: nextCursor || null });
      if (append)  dispatch({ type: 'APPEND_MESSAGES',  roomId, messages });
      else if (page) dispatch({ type: 'PREPEND_MESSAGES', roomId, messages });
      else           dispatch({ type: 'SET_MESSAGES',     roomId, messages });
    });

    socket.on('message', (msg) => {
      // If this is a server-echo of our own optimistic message, skip (already confirmed)
      if (pendingIds.current.has(msg.id)) { pendingIds.current.delete(msg.id); return; }
      dispatch({ type: 'ADD_MESSAGE', roomId: msg.roomId, message: msg });
      dispatch({ type: 'SET_TYPING', roomId: msg.roomId, userId: msg.senderId, clear: true });
    });

    // Optimistic message confirmation
    socket.on('message:ack', ({ clientId, serverId, ts }) => {
      // Remove clientId so it doesn't accumulate (was added in sendMessage)
      pendingIds.current.delete(clientId);
      pendingIds.current.add(serverId); // mark serverId so server echo is skipped
      dispatch({ type: 'CONFIRM_MESSAGE', clientId, serverId, ts });
    });

    // AI streaming chunks
    socket.on('ai:chunk', ({ msgId, roomId, token, done }) => {
      dispatch({ type: 'APPEND_AI_CHUNK', roomId, msgId, token, done });
    });

    socket.on('reaction', ({ messageId, roomId, reactions }) =>
      dispatch({ type: 'UPDATE_REACTIONS', roomId, messageId, reactions })
    );

    socket.on('typing', ({ roomId, userId, username }) => {
      dispatch({ type: 'SET_TYPING', roomId, userId, username });
      const key = `${roomId}_${userId}`;
      clearTimeout(typingTimers.current[key]);
      typingTimers.current[key] = setTimeout(() =>
        dispatch({ type: 'SET_TYPING', roomId, userId, clear: true }), 3500);
    });

    socket.on('typing:stop', ({ roomId, userId }) =>
      dispatch({ type: 'SET_TYPING', roomId, userId, clear: true })
    );

    socket.on('presence', ({ userId, status }) =>
      dispatch({ type: 'SET_PRESENCE', userId, status })
    );

    socket.on('error', ({ error } = {}) => {
      if (error) {
        const activeRoom = stateRef.current?.activeRoomId || 'public';
        dispatch({ type: 'ADD_SYSTEM_ERROR', roomId: activeRoom, error });
      }
    });

    api.getAgents(token).then(res => {
      if (res.ok) dispatch({ type: 'SET_AGENTS', agents: res.agents });
    });

    return () => {
      socket.off('connect'); socket.off('disconnect'); socket.off('auth:ok');
      socket.off('rooms'); socket.off('history'); socket.off('message');
      socket.off('message:ack'); socket.off('ai:chunk');
      socket.off('reaction'); socket.off('typing'); socket.off('typing:stop'); socket.off('presence');
      socket.off('error');
      socket.io.off('reconnect');
      // Clear all typing debounce timers to prevent state updates after unmount
      Object.values(typingTimers.current).forEach(clearTimeout);
      typingTimers.current = {};
    };
  }, [user, token]);

  // Track loading state to prevent duplicate loadMore calls
  const loadingMore = useRef(new Set());

  const joinRoom = useCallback((roomId) => {
    dispatch({ type: 'SET_ACTIVE_ROOM', roomId });

    // If socket is connected → join immediately; otherwise queue for when it connects
    if (socketRef.current?.connected) {
      socketRef.current.emit('join', { roomId });
    } else {
      // Store pending join so connect handler can pick it up
      pendingJoinRef.current = roomId;
    }

    // REST fallback: load messages immediately regardless of socket state
    // Use stateRef to avoid stale closure on state.messages
    if (token && !stateRef.current.messages[roomId]?.length) {
      api.getMessages(roomId, token).then(res => {
        if (res?.messages?.length) {
          dispatch({ type: 'SET_MESSAGES', roomId, messages: res.messages });
        }
      }).catch(() => {/* silent — socket will deliver history when ready */});
    }
  }, [token]);

  const sendMessage = useCallback((roomId, body, type = 'text', replyTo = null, mediaUrl = null, mime = null) => {
    if (!body?.trim() || !user) return;
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Optimistic add
    pendingIds.current.add(clientId);
    dispatch({
      type: 'ADD_MESSAGE', roomId,
      message: {
        id: clientId, roomId,
        senderId: user.id, sender: user.username,
        type, body: body.trim(),
        ts: new Date().toISOString(),
        replyTo, pending: true,
        ...(mediaUrl ? { media_url: mediaUrl, mime } : {})
      }
    });

    const emit = () => {
      const currentRoom = stateRef.current.rooms.find(r => r.id === roomId);
      const isAiRoom = currentRoom?.type === 'ai';
      socketRef.current.emit('message', {
        id: clientId, roomId, type, body: body.trim(), replyTo,
        ...(isAiRoom ? { agentId: 'workflow' } : {}),
        ...(mediaUrl ? { media_url: mediaUrl, mime } : {})
      });
    };

    // If not yet connected, wait and retry
    if (!socketRef.current?.connected) {
      const interval = setInterval(() => {
        if (socketRef.current?.connected) { clearInterval(interval); emit(); }
      }, 300);
      setTimeout(() => clearInterval(interval), 5000); // give up after 5s
      return;
    }

    emit();
  }, [user]);

  const sendTyping = useCallback((roomId) => {
    socketRef.current?.emit('typing', { roomId });
  }, []);

  const sendReaction = useCallback((messageId, roomId, emoji) => {
    socketRef.current?.emit('reaction', { messageId, roomId, emoji });
  }, []);

  const markRead = useCallback((roomId, messageId) => {
    socketRef.current?.emit('read', { roomId, messageId });
  }, []);

  /** Load older messages. Pass `before` cursor (oldest message ts in current list). */
  const loadMore = useCallback((roomId, before) => {
    if (!stateRef.current.hasMore[roomId]) return;
    // Prevent duplicate requests while loading
    if (loadingMore.current.has(roomId)) return;
    loadingMore.current.add(roomId);
    socketRef.current?.emit('history', { roomId, before });
    // Clear loading flag after response (timeout fallback)
    setTimeout(() => loadingMore.current.delete(roomId), 5000);
  }, []);

  return (
    <ChatContext.Provider value={{
      ...state,
      joinRoom, sendMessage, sendTyping, sendReaction, markRead, loadMore,
      dispatch
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
