'use strict';
// env vars loaded by server process
const https = require('https');

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 10, timeout: 30000 });

function askOpenRouter(prompt, model, systemPrompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return reject(new Error('OPENROUTER_API_KEY غير مُعدّ'));

    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt || 'أنت مساعد ذكي. أجب دائماً باللغة العربية.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      agent: keepAliveAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'Madarik'
      }
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let msg = `OpenRouter ${res.statusCode}`;
          try { msg += ': ' + (JSON.parse(raw)?.error?.message || raw.slice(0, 100)); } catch {}
          return reject(new Error(msg));
        }
        try {
          const data = JSON.parse(raw);
          resolve(data.choices?.[0]?.message?.content || '');
        } catch (e) {
          reject(new Error('فشل تحليل استجابة OpenRouter'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('OpenRouter timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = { askOpenRouter };
