'use strict';

class MemoryStore {
  constructor() { this.store = new Map(); }
  async get(key) { return this.store.get(key) || null; }
  async set(key, value) { this.store.set(key, { ...value, timestamp: Date.now() }); }
  async clear(key) { this.store.delete(key); }
  async getHistory(key) {
    const entry = this.store.get(key);
    return entry ? entry.history || [] : [];
  }
  async pushHistory(key, message) {
    const entry = this.store.get(key) || { history: [] };
    entry.history = [...(entry.history || []).slice(-10), message];
    this.store.set(key, entry);
  }
}

module.exports = { MemoryStore };
