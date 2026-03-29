/** client/src/services/socket.js — Socket.io client singleton */
import { io } from 'socket.io-client';

const _isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
const BASE = _isNative
  ? (import.meta.env.VITE_SERVER_URL || 'http://192.168.5.1:3000')
  : import.meta.env.DEV ? 'http://localhost:3000' : '';

let socket = null;
let currentToken = null; // track token to detect changes

export function getSocket(token) {
  // If socket is connected AND token hasn't changed, reuse it
  if (socket?.connected && currentToken === token) return socket;

  // Token changed or socket dead → disconnect old and create fresh
  if (socket) { socket.disconnect(); socket = null; }

  currentToken = token;
  socket = io(BASE, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.3,
    reconnectionAttempts: Infinity   // keep trying rather than giving up
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; currentToken = null; }
}
