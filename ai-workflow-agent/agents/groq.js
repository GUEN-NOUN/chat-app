'use strict';
// env vars loaded by server process
const Groq = require('groq-sdk');

let client;
try {
  if (process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
} catch { /* key not available */ }

async function askGroq(prompt, history = []) {
  if (!client) throw new Error('GROQ_API_KEY غير مُعدّ');
  const messages = [
    { role: 'system', content: 'أنت مساعد سريع ومفيد. أجب دائماً باللغة العربية.' },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt }
  ];
  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: 2000
  });
  return completion.choices[0].message.content;
}

module.exports = { askGroq };
