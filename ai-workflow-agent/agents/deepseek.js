'use strict';
// env vars loaded by server process
const axios = require('axios');

async function askDeepSeek(prompt) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY غير مُعدّ');
  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: 'deepseek-reasoner',
      messages: [
        { role: 'system', content: 'أنت خبير في التفكير المنطقي والرياضيات. أجب باللغة العربية.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );
  return response.data.choices[0].message.content;
}

module.exports = { askDeepSeek };
