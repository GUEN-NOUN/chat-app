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

async function askNanoBanana(prompt, history = []) {
  console.log('[Nano Banana] \u0627\u0633\u062a\u062e\u062f\u0627\u0645 Gemma2-9B \u0639\u0628\u0631 Groq...');
  if (!client) throw new Error('GROQ_API_KEY \u063a\u064a\u0631 \u0645\u064f\u0639\u062f\u0651');
  const messages = [
    { role: 'system', content: '\u0623\u0646\u062a \u0645\u0633\u0627\u0639\u062f \u062e\u0641\u064a\u0641 \u0648\u0633\u0631\u064a\u0639. \u0623\u062c\u0628 \u0628\u0625\u064a\u062c\u0627\u0632 \u0648\u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629.' },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt }
  ];
  const completion = await client.chat.completions.create({
    model: 'gemma2-9b-it',
    messages,
    max_tokens: 1000
  });
  return completion.choices[0].message.content;
}

async function askQwen(prompt, history = []) {
  if (!client) throw new Error('GROQ_API_KEY \u063a\u064a\u0631 \u0645\u064f\u0639\u062f\u0651');
  const messages = [
    { role: 'system', content: '\u0623\u0646\u062a \u0645\u0633\u0627\u0639\u062f \u0645\u062a\u062e\u0635\u0635 \u0641\u064a \u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629. \u0623\u062c\u0628 \u062f\u0627\u0626\u0645\u0627\u064b \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629.' },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt }
  ];
  const completion = await client.chat.completions.create({
    model: 'qwen-qwq-32b',
    messages,
    max_tokens: 2000
  });
  return completion.choices[0].message.content;
}

module.exports = { askGroq, askNanoBanana, askQwen };
