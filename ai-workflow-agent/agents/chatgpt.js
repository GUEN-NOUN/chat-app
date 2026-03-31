'use strict';
// env vars loaded by server process
const OpenAI = require('openai');

let client;
try {
  if (process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch { /* key not available */ }

const SYSTEM_PROMPTS = {
  default: 'أنت مساعد ذكاء اصطناعي متخصص. أجب دائماً باللغة العربية بشكل واضح ومفصل.',
  scholar: `أنت ScholarGPT — نموذج متخصص في البحث الأكاديمي والعلمي.
عند الإجابة:
1. استشهد بالمصادر الأكاديمية عند الإمكان (APA أو IEEE)
2. ميّز بين الحقائق الثابتة والفرضيات
3. اقترح قراءات إضافية ذات صلة
4. استخدم أسلوباً أكاديمياً رصيناً
5. أجب دائماً باللغة العربية`,
  code: 'أنت خبير برمجة. اكتب كوداً نظيفاً موثقاً مع شرح عربي لكل خطوة مهمة.',
  creative: 'أنت مساعد إبداعي. أجب بأسلوب إبداعي وجذاب باللغة العربية.'
};

async function askChatGPT(prompt, mode = 'default', history = []) {
  if (!client) throw new Error('OPENAI_API_KEY غير مُعدّ');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.default },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt }
  ];
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 2000
  });
  return response.choices[0].message.content;
}

async function askScholarGPT(prompt, history = []) {
  return askChatGPT(prompt, 'scholar', history);
}

module.exports = { askChatGPT, askScholarGPT };
