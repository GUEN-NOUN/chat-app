'use strict';
// env loaded by server/index.js — no dotenv needed here

// ══════════════════════════════════════════
//   agents/chatgpt.js
//   يحتوي ScholarGPT إجبارياً
// ══════════════════════════════════════════

let _client = null;
function client() {
  if (!_client) {
    const { default: OpenAI } = require('openai');
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const SYSTEMS = {

  default: `أنت مساعد ذكاء اصطناعي متخصص. أجب دائماً باللغة العربية بشكل واضح ومفصل.`,

  // ══ ScholarGPT ══ إلزامي لا يُحذف ══
  scholar: `أنت ScholarGPT — نموذج GPT متخصص في الإجابة الأكاديمية والامتحانات.

قواعدك الصارمة:
- أجب دائماً باللغة العربية الفصحى
- لأسئلة الامتحانات: قدّم الإجابة النموذجية الكاملة بالتفصيل
- للمسائل الحسابية: اعرض كل خطوة بوضوح مع المعادلات
- للمفاهيم العلمية: تعريف ← شرح ← مثال ← تطبيق
- اذكر المصدر العلمي إن أمكن
- أضف "ملاحظة أكاديمية" لأي استثناء أو تفصيل مهم
- في نهاية الإجابة: "هل تريد شرحاً إضافياً لأي نقطة؟"

تخصصاتك: الفيزياء، الكيمياء، الرياضيات، الأحياء، التاريخ، الجغرافيا، الأدب، الفلسفة، الاقتصاد، البرمجة، الهندسة`,

  code: `أنت مبرمج خبير. اكتب كوداً نظيفاً موثقاً مع شرح عربي لكل منطق معقد. أضف معالجة الأخطاء دائماً.`,

  vision: `أنت محلل صور ذكي. حلّل الصورة بدقة واذكر كل التفاصيل المهمة باللغة العربية.`
};

async function askChatGPT(prompt, mode = 'default', history = [], imageBase64 = null) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.startsWith('sk-')) {
    throw new Error('OPENAI_API_KEY غير مضبوط');
  }

  const userContent = imageBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ]
    : prompt;

  const messages = [
    { role: 'system', content: SYSTEMS[mode] || SYSTEMS.default },
    ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userContent }
  ];

  const response = await client().chat.completions.create({
    model: imageBase64 ? 'gpt-4o' : 'gpt-4o',
    messages,
    max_tokens: 3000,
    temperature: mode === 'scholar' ? 0.1 : 0.7
  });
  return response.choices[0].message.content;
}

// ScholarGPT — إلزامي — GPT-4o أكاديمي متخصص
async function askScholarGPT(prompt, history = []) {
  return askChatGPT(prompt, 'scholar', history);
}

// تحليل صور عبر GPT-4 Vision
async function analyzeImageGPT(prompt, imageBase64) {
  return askChatGPT(prompt || 'حلل هذه الصورة بالتفصيل', 'vision', [], imageBase64);
}

module.exports = { askChatGPT, askScholarGPT, analyzeImageGPT };
