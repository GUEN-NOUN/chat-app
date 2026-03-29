'use strict';

const express  = require('express');
const crypto   = require('crypto');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAgents, getAgentById, createAgent, updateAgent, deleteAgent } = require('../db');
const aiService = require('../services/ai.service');

const router = express.Router();

/* GET /api/agents — list active agents */
router.get('/', requireAuth, (_req, res) => {
  const agents = getAgents(true).map(a => ({
    id: a.id, name: a.name, description: a.description,
    avatar: a.avatar, provider: a.provider, model: a.model,
    capabilities: JSON.parse(a.capabilities || '[]'), active: a.active
    // api_key_env intentionally excluded from response
  }));
  return res.json({ ok: true, agents });
});

/* GET /api/agents/:id */
router.get('/:id', requireAuth, (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent || !agent.active) return res.status(404).json({ ok: false });
  return res.json({
    ok: true,
    agent: { id: agent.id, name: agent.name, description: agent.description,
      avatar: agent.avatar, provider: agent.provider, capabilities: JSON.parse(agent.capabilities || '[]') }
  });
});

/* POST /api/agents — create agent (admin only) */
router.post('/', requireAdmin, (req, res) => {
  const { name, description, avatar, provider, model, system_prompt, api_key_env, capabilities } = req.body || {};
  if (!name || !provider) return res.status(400).json({ ok: false, error: 'name and provider required' });
  const allowed = ['openai', 'gemini', 'custom'];
  if (!allowed.includes(provider)) return res.status(400).json({ ok: false, error: 'Invalid provider' });

  const agent = createAgent({
    id: `agent-${crypto.randomUUID()}`,
    name: String(name).slice(0, 60),
    description: String(description || '').slice(0, 200),
    avatar: String(avatar || '🤖').slice(0, 8),
    provider,
    model: String(model || ''),
    system_prompt: String(system_prompt || ''),
    api_key_env: String(api_key_env || ''),
    capabilities: JSON.stringify(Array.isArray(capabilities) ? capabilities : [])
  });
  return res.status(201).json({ ok: true, agent });
});

/* PUT /api/agents/:id — update agent (admin only) */
router.put('/:id', requireAdmin, (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ ok: false });
  updateAgent(req.params.id, req.body);
  return res.json({ ok: true, agent: getAgentById(req.params.id) });
});

/* DELETE /api/agents/:id (admin only) */
router.delete('/:id', requireAdmin, (req, res) => {
  deleteAgent(req.params.id);
  return res.json({ ok: true });
});

/* POST /api/agents/:id/chat — send a message to an AI agent */
router.post('/:id/chat', requireAuth, async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string')
    return res.status(400).json({ ok: false, error: 'message required' });

  const agent = getAgentById(req.params.id);
  if (!agent || !agent.active) return res.status(404).json({ ok: false, error: 'Agent not found' });

  try {
    const reply = await aiService.chat(agent, message, history || []);
    return res.json({ ok: true, reply, agentId: agent.id, agentName: agent.name });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'AI service unavailable', useLocal: true });
  }
});

module.exports = router;
