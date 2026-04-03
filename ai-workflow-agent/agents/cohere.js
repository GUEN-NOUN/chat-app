'use strict';
// env vars loaded by server process
const axios = require('axios');

async function askCohere(prompt) {
  if (!process.env.COHERE_API_KEY) throw new Error('COHERE_API_KEY \u063a\u064a\u0631 \u0645\u064f\u0639\u062f\u0651');
  const response = await axios.post(
    'https://api.cohere.com/v2/chat',
    {
      model: 'command-r-plus-08-2024',
      messages: [
        {
          role: 'system',
          content: '\u0623\u0646\u062a \u0645\u0633\u0627\u0639\u062f \u0645\u062a\u062e\u0635\u0635 \u0641\u064a \u0627\u0644\u062a\u0644\u062e\u064a\u0635 \u0648\u0627\u0644\u062a\u0631\u062c\u0645\u0629. \u0623\u062c\u0628 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629.'
        },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );
  return response.data.message.content[0].text;
}

module.exports = { askCohere };
