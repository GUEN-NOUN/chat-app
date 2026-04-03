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
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: 'أنت مساعد برمجي خبير. أجب دائماً باللغة العربية مع كود نظيف وموثق.',
    messages
  });
  return message.content[0].text;
}

async function askClaudeVision(prompt, imageBase64, mimeType = 'image/jpeg') {
  if (!client) throw new Error('ANTHROPIC_API_KEY \u063a\u064a\u0631 \u0645\u064f\u0639\u062f\u0651');
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: `\u0623\u062c\u0628 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629.\n${prompt}` }
      ]
    }]
  });
  return response.content[0].text;
}

module.exports = { askClaude, askClaudeVision };
