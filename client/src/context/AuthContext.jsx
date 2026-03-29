import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

const STORAGE_KEY = 'madarik_chat_v2';

/** Generate or retrieve a stable device ID */
function getDeviceId() {
  let id = localStorage.getItem('madarik_device_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('madarik_device_id', id);
  }
  return id;
}

/** Generate a random Arabic guest name like "طالب_4721" */
function generateGuestName() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `طالب_${num}`;
}

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  // On mount: restore session OR auto-register as a new guest
  useEffect(() => {
    async function init() {
      // 1. Try to restore saved session
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved?.token && saved?.user) {
          // Validate token against server (catches JWT_SECRET changes after restart)
          const me = await api.request('GET', '/api/users/me', null, saved.token).catch(() => null);
          if (me?.ok) {
            setUser(saved.user);
            setToken(saved.token);
            setReady(true);
            return;
          }
          // Token invalid — fall through to re-register below
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch { /* ignore parse errors */ }

      // 2. No session or invalid token → re-register with saved name or new guest name
      try {
        const deviceId = getDeviceId();
        const savedName = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.user?.username;
        const username = savedName || generateGuestName();
        const res = await api.register(deviceId, username);
        if (res.ok) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.user, token: res.token }));
          setUser(res.user);
          setToken(res.token);
        }
      } catch {
        // Server unreachable — app will show a connection error via conn-banner
      }
      setReady(true);
    }
    init();
  }, []);

  /** login — called from the "Edit Name" modal to change display name */
  const login = useCallback(async (username) => {
    const deviceId = getDeviceId();
    const res = await api.register(deviceId, username);
    if (!res.ok) throw new Error(res.error || 'Registration failed');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.user, token: res.token }));
    setUser(res.user);
    setToken(res.token);
    return res;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
