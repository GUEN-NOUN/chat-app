'use strict';
// env vars loaded by server process
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch { /* key not available */ }

async function askGemini(prompt) {
  if (!genAI) throw new Error('GEMINI_API_KEY غير مُعدّ');
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: 'أنت مساعد ذكي. أجب دائماً باللغة العربية.'
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { askGemini };
