'use strict';

const { routeTask, RULES } = require('./router');
const { MemoryStore } = require('./memory');

const memory = new MemoryStore();

async function runOrchestrator(userInput, sessionId = 'default') {
  console.log(`\n🧠 AI Workflow | session=${sessionId} | input="${userInput.slice(0, 60)}..."`);

  const history = await memory.getHistory(sessionId);
  const result = await routeTask(userInput, history);

  await memory.pushHistory(sessionId, { role: 'user', content: userInput });
  await memory.pushHistory(sessionId, { role: 'assistant', content: result.output });
  await memory.set(sessionId, { lastModel: result.model, lastInput: userInput });

  console.log(`  ✅ ${result.emoji} ${result.model} → ${result.output.length} chars`);
  return result;
}

function getAvailableAgents() {
  return RULES.map(r => ({ name: r.name, emoji: r.emoji, keywords: r.keywords }));
}

module.exports = { runOrchestrator, getAvailableAgents };
