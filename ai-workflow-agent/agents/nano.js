'use strict';
// env vars loaded by server process

async function askNanoBanana(prompt) {
  const Groq = require('groq-sdk');
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY غير مُعدّ');
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await client.chat.completions.create({
    model: 'gemma2-9b-it',
    messages: [
      { role: 'system', content: 'أنت مساعد خفيف وسريع. أجب بإيجاز وباللغة العربية.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 1000
  });
  return completion.choices[0].message.content;
}

module.exports = { askNanoBanana };
