/** client/src/services/api.js — REST API wrapper */
const _isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
const BASE = _isNative
  ? (import.meta.env.VITE_SERVER_URL || 'http://192.168.5.1:3000')
  : import.meta.env.DEV ? 'http://localhost:3000' : '';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, status: res.status, error: `Server error ${res.status}` }; }
}

export const api = {
  request,
  register:     (deviceId, username)   => request('POST', '/api/users/register', { deviceId, username }),
  getRooms:     (token)                => request('GET',  '/api/chats', null, token),
  getRoom:      (id, token)            => request('GET',  `/api/chats/${id}`, null, token),
  createRoom:   (data, token)          => request('POST', '/api/chats', data, token),
  getMessages:  (roomId, token, q='')  => request('GET',  `/api/messages/${roomId}${q}`, null, token),
  react:        (msgId, emoji, token)  => request('POST', `/api/messages/${msgId}/react`, { emoji }, token),
  deleteMsg:    (msgId, token)         => request('DELETE', `/api/messages/${msgId}`, null, token),
  getAgents:    (token)                => request('GET',  '/api/agents', null, token),
  chatAgent:    (agentId, msg, history, token) => request('POST', `/api/agents/${agentId}/chat`, { message: msg, history }, token),
  searchUsers:  (query, token)         => request('GET',  `/api/users/search?q=${encodeURIComponent(query)}`, null, token),
  getUser:      (id, token)            => request('GET',  `/api/users/${id}`, null, token),
  addMember:    (roomId, userId, token) => request('POST', `/api/chats/${roomId}/members`, { userId }, token),
  uploadFile:   async (file, token, onProgress, onXhr) => {
    const fd  = new FormData();
    fd.append('file', file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      if (onXhr) onXhr(xhr);   // expose XHR so caller can abort
      xhr.open('POST', `${BASE}/api/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.withCredentials = true;
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload  = () => {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid JSON response')); }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(fd);
    });
  }
};
