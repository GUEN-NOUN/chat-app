'use strict';

/**
 * server/services/ai.service.js
 * Multi-provider AI: OpenAI, Google Gemini, Custom
 * Supports standard (cached) calls + streaming (SSE â†’ socket chunks).
 */

const https = require('https');

/* ── Reusable HTTPS agents (keep-alive = reuse TCP connections) ── */
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
});

/* â”€â”€ LRU-like cache (non-streaming calls only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const cache     = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 500;

function cacheKey(agentId, messages) {
  return `${agentId}::${JSON.stringify(messages).slice(0, 200)}`;
}
function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return e.value;
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, ts: Date.now() });
}

/* â”€â”€ Low-level HTTPS POST (non-streaming) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(
      { hostname, path, method: 'POST', agent: keepAliveAgent, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } },
      res => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('AI request timeout')); });
    req.write(data);
    req.end();
  });
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STANDARD (non-streaming) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

async function callOpenAI(agent, message, history) {
  const apiKey = process.env[agent.api_key_env] || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');
  const messages = [
    { role: 'system', content: agent.system_prompt || 'You are a helpful assistant.' },
    ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];
  const res = await httpsPost('api.openai.com', '/v1/chat/completions',
    { Authorization: `Bearer ${apiKey}` },
    { model: agent.model || 'gpt-4o-mini', messages, max_tokens: 1024, temperature: 0.7 }
  );
  if (res.status !== 200) throw new Error(`OpenAI error ${res.status}`);
  return res.body.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(agent, message, history) {
  const apiKey = process.env[agent.api_key_env] || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');
  const model    = agent.model || 'gemini-1.5-flash';
  const apiPath  = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = [
    ...history.slice(-10).map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];
  const res = await httpsPost('generativelanguage.googleapis.com', apiPath, {}, {
    contents,
    systemInstruction: { parts: [{ text: agent.system_prompt || 'You are a helpful assistant.' }] },
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
  });
  if (res.status !== 200) throw new Error(`Gemini error ${res.status}`);
  return res.body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function callCustom(agent, message, history) {
  return callOpenAI(agent, message, history);
}

/* ── OpenRouter (free models, OpenAI-compatible) ──────────── */
async function callOpenRouter(agent, message, history) {
  const apiKey = process.env[agent.api_key_env] || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OpenRouter API key not configured');
  const messages = [
    { role: 'system', content: agent.system_prompt || 'You are a helpful assistant.' },
    ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];
  const res = await httpsPost('openrouter.ai', '/api/v1/chat/completions',
    { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000', 'X-Title': 'Madarik' },
    { model: agent.model || 'openrouter/free', messages, max_tokens: 1024, temperature: 0.7 }
  );
  if (res.status !== 200) throw new Error(`OpenRouter error ${res.status}: ${res.body?.error?.message || ''}`);
  return res.body.choices?.[0]?.message?.content?.trim() || '';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STREAMING â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/**
 * streamOpenAI â€” calls GPT with stream:true, emits tokens via onChunk(token, done).
 * onChunk('', true) signals completion with empty final token.
 */
function streamOpenAI(agent, message, history, onChunk) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env[agent.api_key_env] || process.env.OPENAI_API_KEY;
    if (!apiKey) return reject(new Error('OpenAI API key not configured'));

    const messages = [
      { role: 'system', content: agent.system_prompt || 'You are a helpful assistant.' },
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];
    const payload = JSON.stringify({
      model: agent.model || 'gpt-4o-mini',
      messages, max_tokens: 1024, temperature: 0.7, stream: true
    });

    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
      agent: keepAliveAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${apiKey}`
      }
    }, res => {
      let fullText = '';
      let buffer   = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const token  = parsed.choices?.[0]?.delta?.content;
            if (token) { fullText += token; onChunk(token, false); }
          } catch { /* malformed chunk â€” skip */ }
        }
      });
      res.on('end', () => { onChunk('', true); resolve(fullText); });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Streaming timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * streamGemini â€” calls Gemini SSE endpoint, emits tokens via onChunk.
 */
function streamGemini(agent, message, history, onChunk) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env[agent.api_key_env] || process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('Gemini API key not configured'));

    const model   = agent.model || 'gemini-1.5-flash';
    const apiPath = `/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const contents = [
      ...history.slice(-10).map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];
    const payload = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: agent.system_prompt || 'You are a helpful assistant.' }] },
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com', path: apiPath, method: 'POST',
      agent: keepAliveAgent,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let fullText = '';
      let buffer   = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            const token  = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (token) { fullText += token; onChunk(token, false); }
          } catch { /* skip */ }
        }
      });
      res.on('end', () => { onChunk('', true); resolve(fullText); });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Gemini streaming timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * streamOpenRouter — OpenAI-compatible streaming via OpenRouter (free models).
 */
function streamOpenRouter(agent, message, history, onChunk) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env[agent.api_key_env] || process.env.OPENROUTER_API_KEY;
    if (!apiKey) return reject(new Error('OpenRouter API key not configured'));

    const messages = [
      { role: 'system', content: agent.system_prompt || 'You are a helpful assistant.' },
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];
    const payload = JSON.stringify({
      model: agent.model || 'google/gemini-2.0-flash-exp:free',
      messages, max_tokens: 1024, temperature: 0.7, stream: true
    });

    const req = https.request({
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      agent: keepAliveAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'Madarik'
      }
    }, res => {
      let fullText = '';
      let buffer   = '';
      // Handle non-200: read full body and emit error
      if (res.statusCode !== 200) {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          let msg = `OpenRouter error ${res.statusCode}`;
          try { msg += ': ' + (JSON.parse(raw)?.error?.message || raw.slice(0,100)); } catch {}
          reject(new Error(msg));
        });
        return;
      }
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const token  = parsed.choices?.[0]?.delta?.content;
            if (token) { fullText += token; onChunk(token, false); }
          } catch { /* skip */ }
        }
      });
      res.on('end', () => { onChunk('', true); resolve(fullText); });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('OpenRouter streaming timeout')); });
    req.write(payload);
    req.end();
  });
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PUBLIC API â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/** Standard (cached) call â€” used for REST /api/agents/:id/chat */
async function chat(agent, message, history = []) {
  const key    = cacheKey(agent.id, [...history.slice(-3), { role: 'user', content: message }]);
  const cached = cacheGet(key);
  if (cached) return cached;

  let reply;
  switch (agent.provider) {
    case 'openai':
    case 'cloud':  reply = await callOpenAI(agent, message, history); break;
    case 'gemini': reply = await callGemini(agent, message, history); break;
    case 'openrouter': reply = await callOpenRouter(agent, message, history); break;
    case 'custom': reply = await callCustom(agent, message, history); break;
    default:       throw new Error(`Unknown provider: ${agent.provider}`);
  }

  cacheSet(key, reply);
  return reply;
}

/**
 * streamChat â€” streaming call for Socket.io.
 * onChunk(token: string, done: boolean) is called for each token.
 * Falls back to non-streaming (single onChunk call) for unsupported providers.
 */
async function streamChat(agent, message, history = [], onChunk) {
  switch (agent.provider) {
    case 'openai':
    case 'cloud':
      return streamOpenAI(agent, message, history, onChunk);
    case 'gemini':
      return streamGemini(agent, message, history, onChunk);
    case 'openrouter':
      return streamOpenRouter(agent, message, history, onChunk);
    case 'auto': {
      // Pick best available free agent automatically
      const { getAgentById } = require('../db');
      const preference = [
        { id: 'agent-gemini-free',  envKey: 'OPENROUTER_API_KEY' },
        { id: 'agent-deepseek-free', envKey: 'OPENROUTER_API_KEY' },
        { id: 'agent-llama-free',   envKey: 'OPENROUTER_API_KEY' },
        { id: 'agent-gpt',          envKey: 'OPENAI_API_KEY'     },
        { id: 'agent-gemini',       envKey: 'GEMINI_API_KEY'     },
      ];
      for (const { id, envKey } of preference) {
        if (!process.env[envKey]) continue;
        const candidate = getAgentById(id);
        if (candidate?.active) {
          // Force openrouter/free as the model for auto routing
          const autoAgent = { ...candidate, model: candidate.model || 'openrouter/free' };
          return streamChat(autoAgent, message, history, onChunk);
        }
      }
      onChunk('⚠️ لا يوجد وكيل متاح. تحقق من إعداد مفاتيح API.', false);
      onChunk('', true);
      return;
    }
    default: {
      // Fallback: call normally, emit as single chunk
      const reply = await chat(agent, message, history);
      onChunk(reply, false);
      onChunk('', true);
      return reply;
    }
  }
}

module.exports = { chat, streamChat };
