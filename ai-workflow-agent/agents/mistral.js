'use strict';
// env vars loaded by server process
const axios = require('axios');

async function askMistral(prompt) {
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY \u063a\u064a\u0631 \u0645\u064f\u0639\u062f\u0651');
  const response = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    {
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: '\u0623\u0646\u062a \u0645\u0633\u0627\u0639\u062f \u0630\u0643\u064a. \u0623\u062c\u0628 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );
  return response.data.choices[0].message.content;
}

module.exports = { askMistral };
