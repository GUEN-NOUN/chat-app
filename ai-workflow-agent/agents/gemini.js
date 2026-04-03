'use strict';
// env vars loaded by server process
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch { /* key not available */ }

function getClient() {
  if (genAI) return genAI;
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير مُعدّ');
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

async function askGemini(prompt) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: 'أنت مساعد ذكي. أجب دائماً باللغة العربية.'
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function askGeminiPro(prompt, history = []) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: 'أنت مساعد ذكي متقدم. أجب دائماً باللغة العربية.'
  });
  const chat = model.startChat({
    history: history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }))
  });
  const result = await chat.sendMessage(prompt);
  return result.response.text();
}

async function askGeminiVision(prompt, imageBase64, mimeType = 'image/jpeg') {
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  const result = await model.generateContent({
    contents: [{ parts: [
      { inlineData: { mimeType, data: imageBase64 } },
      { text: `أجب باللغة العربية.\n${prompt}` }
    ]}]
  });
  return result.response.text();
}

async function askGeminiAudio(audioBase64, mimeType = 'audio/webm') {
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  const result = await model.generateContent({
    contents: [{ parts: [
      { inlineData: { mimeType, data: audioBase64 } },
      { text: 'حوّل هذا الصوت إلى نص باللغة العربية بدقة تامة.' }
    ]}]
  });
  return result.response.text();
}

module.exports = { askGemini, askGeminiPro, askGeminiVision, askGeminiAudio };
