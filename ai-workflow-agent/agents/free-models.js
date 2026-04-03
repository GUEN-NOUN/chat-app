'use strict';
// env loaded by server/index.js — no dotenv needed here

// ══════════════════════════════════════════
//   agents/free-models.js
//   جميع النماذج المجانية في ملف واحد
// ══════════════════════════════════════════

const axios = require('axios');

// ──────────────────────────────────────────
// GROQ — مجاني بالكامل (Llama + Gemma + Qwen)
// ──────────────────────────────────────────
let _groq = null;
function groqClient() {
  if (!_groq) {
    const Groq = require('groq-sdk');
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

async function askGroq(prompt, history = [], model = 'llama-3.3-70b-versatile') {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY غير مضبوط');
  const messages = [
    { role: 'system', content: 'أنت مساعد ذكي سريع. أجب باللغة العربية دائماً.' },
    ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt }
  ];
  const r = await groqClient().chat.completions.create({ model, messages, max_tokens: 2000 });
  return r.choices[0].message.content;
}

// Nano Banana = Gemma2 9B عبر Groq
async function askNanoBanana(prompt) {
  return askGroq(prompt, [], 'gemma2-9b-it');
}

// Qwen 2.5 عبر Groq
async function askQwen(prompt, history = []) {
  return askGroq(prompt, history, 'qwen-qwq-32b');
}

// Llama Vision عبر Groq
async function askGroqVision(prompt, imageBase64) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY غير مضبوط');
  const r = await groqClient().chat.completions.create({
    model: 'llama-3.2-11b-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt || 'حلّل هذه الصورة بالعربية' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ]
    }],
    max_tokens: 2000
  });
  return r.choices[0].message.content;
}

// ──────────────────────────────────────────
// GEMINI — مجاني بحد يومي
// ──────────────────────────────────────────
let _genAI = null;
function geminiClient() {
  if (!_genAI) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _genAI;
}

async function askGemini(prompt, modelName = 'gemini-1.5-flash') {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير مضبوط');
  const model = geminiClient().getGenerativeModel({
    model: modelName,
    systemInstruction: 'أجب دائماً باللغة العربية بشكل واضح.'
  });
  const r = await model.generateContent(prompt);
  return r.response.text();
}

async function askGeminiPro(prompt) {
  return askGemini(prompt, 'gemini-1.5-pro');
}

// Gemini Vision
async function askGeminiVision(prompt, imageBase64) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير مضبوط');
  const model = geminiClient().getGenerativeModel({ model: 'gemini-1.5-flash' });
  const r = await model.generateContent([
    prompt || 'حلّل هذه الصورة',
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
  ]);
  return r.response.text();
}

// ──────────────────────────────────────────
// DEEPSEEK — مجاني (R1 للتفكير العميق)
// ──────────────────────────────────────────
async function askDeepSeek(prompt, reasoner = true) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY غير مضبوط');
  const r = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: reasoner ? 'deepseek-reasoner' : 'deepseek-chat',
      messages: [
        { role: 'system', content: 'أنت خبير تفكير ومنطق. أجب باللغة العربية مع عرض خطوات التفكير.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000
    },
    { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 60000 }
  );
  return r.data.choices[0].message.content;
}

// ──────────────────────────────────────────
// MISTRAL — مجاني
// ──────────────────────────────────────────
async function askMistral(prompt) {
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY غير مضبوط');
  const r = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    {
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'أجب باللغة العربية.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000
    },
    { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' } }
  );
  return r.data.choices[0].message.content;
}

// ──────────────────────────────────────────
// COHERE — مجاني (ممتاز للتلخيص)
// ──────────────────────────────────────────
async function askCohere(prompt) {
  if (!process.env.COHERE_API_KEY) throw new Error('COHERE_API_KEY غير مضبوط');
  const r = await axios.post(
    'https://api.cohere.com/v2/chat',
    {
      model: 'command-r-plus-08-2024',
      messages: [
        { role: 'system', content: 'أنت متخصص في التلخيص والتحليل. أجب باللغة العربية.' },
        { role: 'user', content: prompt }
      ]
    },
    { headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}`, 'Content-Type': 'application/json' } }
  );
  return r.data.message.content[0].text;
}

// ──────────────────────────────────────────
// CLAUDE — Haiku (أرخص نموذج من Anthropic)
// ──────────────────────────────────────────
let _claude = null;
function claudeClient() {
  if (!_claude) {
    const Anthropic = require('@anthropic-ai/sdk');
    _claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _claude;
}

async function askClaude(prompt, history = []) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY غير مضبوط');
  const messages = [
    ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt }
  ];
  const r = await claudeClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: 'أنت مبرمج خبير. اكتب كوداً نظيفاً موثقاً مع شرح عربي. أضف معالجة أخطاء دائماً.',
    messages
  });
  return r.content[0].text;
}

module.exports = {
  askGroq, askNanoBanana, askQwen, askGroqVision,
  askGemini, askGeminiPro, askGeminiVision,
  askDeepSeek,
  askMistral,
  askCohere,
  askClaude
};
