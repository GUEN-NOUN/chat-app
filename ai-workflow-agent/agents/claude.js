'use strict';
// env vars loaded by server process
const Anthropic = require('@anthropic-ai/sdk');

let client;
try {
  if (process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch { /* key not available */ }

async function askClaude(prompt, history = []) {
  if (!client) throw new Error('ANTHROPIC_API_KEY غير مُعدّ');
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt }
  ];
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: 'أنت مساعد برمجي خبير. أجب دائماً باللغة العربية مع كود نظيف وموثق.',
    messages
  });
  return message.content[0].text;
}

module.exports = { askClaude };
