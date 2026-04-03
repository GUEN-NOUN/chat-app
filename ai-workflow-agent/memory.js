'use strict';

// ══════════════════════════════════════════
//   memory.js — إدارة السياق والجلسات
// ══════════════════════════════════════════

class MemoryStore {
  constructor() { this.sessions = new Map(); }

  _get(id) {
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { history: [], meta: {}, created: Date.now() });
    }
    return this.sessions.get(id);
  }

  async getHistory(id)              { return this._get(id).history.slice(-16); }
  async push(id, role, content)     {
    const s = this._get(id);
    s.history.push({ role, content, ts: Date.now() });
    if (s.history.length > 30) s.history = s.history.slice(-30);
  }
  async setMeta(id, k, v)           { this._get(id).meta[k] = v; }
  async getMeta(id, k)              { return this._get(id).meta[k]; }
  async clear(id)                   { this.sessions.delete(id); }
  stats() {
    let msgs = 0;
    this.sessions.forEach(s => { msgs += s.history.length; });
    return { sessions: this.sessions.size, totalMessages: msgs };
  }
}

module.exports = { MemoryStore };
