'use strict';
// env vars loaded by server process — NO dotenv.config() here
const https = require('https');

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });

/**
 * Call OpenRouter API.
 * @param {string|Array} promptOrMessages  — string prompt OR full messages array (for vision)
 * @param {string} model                   — OpenRouter model ID
 * @param {string} [systemPrompt]          — system prompt (only used when first arg is a string)
 * @param {object} [opts]                  — { max_tokens, temperature }
 */
function askOpenRouter(promptOrMessages, model, systemPrompt, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return reject(new Error('OPENROUTER_API_KEY غير مُعدّ'));
    if (!model)  return reject(new Error('model مطلوب لـ OpenRouter'));

    // Build messages array — accept pre-built array (vision) or plain string
    let messages;
    if (Array.isArray(promptOrMessages)) {
      messages = promptOrMessages;
    } else {
      messages = [
        { role: 'system', content: systemPrompt || 'أنت مساعد ذكي تعليمي. أجب دائماً باللغة العربية بشكل واضح ومفصل.' },
        { role: 'user',   content: String(promptOrMessages) }
      ];
    }

    const body = JSON.stringify({
      model,
      messages,
      max_tokens:  opts.max_tokens  || 4000,
      temperature: opts.temperature || 0.7,
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      path:     '/api/v1/chat/completions',
      method:   'POST',
      agent:    keepAliveAgent,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization':  'Bearer ' + apiKey,
        'HTTP-Referer':   process.env.SITE_URL || 'http://localhost:3000',
        'X-Title':        'Madarik Educational',
      }
    }, function(res) {
      let raw = '';
      res.on('data', function(d) { raw += d; });
      res.on('end', function() {
        if (res.statusCode !== 200) {
          let msg = 'OpenRouter HTTP ' + res.statusCode;
          try { msg += ': ' + (JSON.parse(raw).error.message || raw.slice(0, 120)); } catch(e) {}
          return reject(new Error(msg));
        }
        try {
          const data = JSON.parse(raw);
          const choice = data.choices && data.choices[0];
          const content = choice && choice.message && choice.message.content;
          // content can be null for models that refuse — treat as empty string so caller decides
          if (content === undefined && !choice) return reject(new Error('OpenRouter: لا توجد استجابة من ' + model));
          resolve(content || '');
        } catch (e) {
          reject(new Error('فشل تحليل استجابة OpenRouter: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, function() { req.destroy(); reject(new Error('OpenRouter timeout (60s)')); });
    req.write(body);
    req.end();
  });
}

/**
 * OpenRouter Vision — multimodal image analysis.
 * Uses free vision-capable models.
 */
function askOpenRouterVision(prompt, imageBase64, mimeType) {
  const visionModels = [
    'google/gemma-3-12b-it:free',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-4b-it:free',
  ];
  const mime = mimeType || 'image/jpeg';
  const messages = [
    { role: 'system', content: 'أنت محلل صور ذكي. حلّل الصورة بدقة واذكر كل التفاصيل المهمة باللغة العربية.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt || 'حلل هذه الصورة بالتفصيل' },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } }
      ]
    }
  ];

  // Try models in sequence until one works
  async function tryModels(idx) {
    if (idx >= visionModels.length) throw new Error('جميع نماذج الرؤية OpenRouter فشلت');
    try {
      const result = await askOpenRouter(messages, visionModels[idx], null, { max_tokens: 3000 });
      if (result && result.trim().length > 3) return result;
      return tryModels(idx + 1);
    } catch (e) {
      console.warn('  ✗ OpenRouter Vision ' + visionModels[idx].split('/').pop() + ': ' + e.message);
      return tryModels(idx + 1);
    }
  }
  return tryModels(0);
}

module.exports = { askOpenRouter, askOpenRouterVision };
