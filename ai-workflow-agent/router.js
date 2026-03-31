'use strict';
// env vars loaded by server process

const { askOpenRouter } = require('./agents/openrouter');

// Lazy-load agents to avoid crash if SDK not installed
function tryLoad(fn) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (err) {
      // If it's a "key not configured" error, rethrow so fallback kicks in
      if (/غير مُعدّ|not configured|MODULE_NOT_FOUND/i.test(err.message)) throw err;
      throw err;
    }
  };
}

// Free OpenRouter models for fallback (newest first — March 2026)
const FREE_MODELS = [
  'qwen/qwen3.6-plus-preview:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'minimax/minimax-m2.5:free',
  'stepfun/step-3.5-flash:free',
  'google/gemma-3-27b-it:free'
];

async function withFallback(primaryFn, prompt, history, fallbackSystemPrompt) {
  // Try primary agent first
  try {
    return await primaryFn(prompt, history);
  } catch (primaryErr) {
    console.log(`  ⚠ Primary agent failed: ${primaryErr.message?.slice(0, 80)}`);
  }
  // Fallback: try free OpenRouter models
  for (const model of FREE_MODELS) {
    try {
      console.log(`  ↻ Fallback → ${model}`);
      return await askOpenRouter(prompt, model, fallbackSystemPrompt);
    } catch (err) {
      console.log(`  ✗ ${model}: ${err.message?.slice(0, 60)}`);
    }
  }
  throw new Error('جميع النماذج فشلت. تحقق من مفاتيح API في server/.env');
}

// Routing rules — Arabic + English keywords
const RULES = [
  {
    name: 'ScholarGPT',
    emoji: '🎓',
    keywords: ['بحث','دراسة','paper','research','مقال علمي','academic','scholar','مرجع','مراجع','دراسات'],
    handler: (p, h) => {
      const { askScholarGPT } = require('./agents/chatgpt');
      return withFallback(
        (prompt) => askScholarGPT(prompt, h),
        p, h,
        'أنت باحث أكاديمي. استشهد بالمصادر وأجب باللغة العربية بأسلوب أكاديمي.'
      );
    }
  },
  {
    name: 'DeepSeek R1',
    emoji: '🧮',
    keywords: ['رياضيات','معادلة','حساب','math','equation','تفكير','reason','منطق','logic','خوارزمية'],
    handler: (p, h) => {
      const { askDeepSeek } = require('./agents/deepseek');
      return withFallback(
        (prompt) => askDeepSeek(prompt),
        p, h,
        'أنت خبير في التفكير المنطقي والرياضيات. أجب باللغة العربية مع خطوات مفصلة.'
      );
    }
  },
  {
    name: 'Claude Sonnet',
    emoji: '💻',
    keywords: ['كود','برمجة','code','function','debug','خطأ','bug','script','python','javascript','nodejs'],
    handler: (p, h) => {
      const { askClaude } = require('./agents/claude');
      return withFallback(
        (prompt) => askClaude(prompt, h),
        p, h,
        'أنت خبير برمجة. اكتب كوداً نظيفاً موثقاً مع شرح عربي.'
      );
    }
  },
  {
    name: 'Gemini 1.5 Pro',
    emoji: '🔬',
    keywords: ['صورة','image','vision','تحليل','analyze','بيانات','data','جدول','table'],
    handler: (p, h) => {
      const { askGemini } = require('./agents/gemini');
      return withFallback(
        (prompt) => askGemini(prompt),
        p, h,
        'أنت محلل بيانات خبير. حلل وأجب باللغة العربية.'
      );
    }
  },
  {
    name: 'Groq Llama 3.3',
    emoji: '⚡',
    keywords: ['سريع','quick','fast','ملخص','summary','brief','مختصر'],
    handler: (p, h) => {
      const { askGroq } = require('./agents/groq');
      return withFallback(
        (prompt) => askGroq(prompt, h),
        p, h,
        'أنت مساعد سريع. أجب بإيجاز باللغة العربية.'
      );
    }
  },
  {
    name: 'Nano Banana',
    emoji: '🍌',
    keywords: ['بسيط','simple','سؤال بسيط','قصير','short','خفيف'],
    handler: (p, h) => {
      const { askNanoBanana } = require('./agents/nano');
      return withFallback(
        (prompt) => askNanoBanana(prompt),
        p, h,
        'أنت مساعد خفيف وسريع. أجب بإيجاز وباللغة العربية.'
      );
    }
  }
];

async function routeTask(input, history = []) {
  const lower = input.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      console.log(`  → ${rule.emoji} التوجيه إلى: ${rule.name}`);
      const output = await rule.handler(input, history);
      return { model: rule.name, emoji: rule.emoji, output };
    }
  }
  // Default: try ChatGPT, fallback to OpenRouter
  console.log('  → 🤖 التوجيه إلى: ChatGPT GPT-4o (افتراضي)');
  try {
    const { askChatGPT } = require('./agents/chatgpt');
    const output = await withFallback(
      (prompt) => askChatGPT(prompt, 'default', history),
      input, history,
      'أنت مساعد ذكاء اصطناعي متخصص. أجب دائماً باللغة العربية بشكل واضح ومفصل.'
    );
    return { model: 'ChatGPT GPT-4o', emoji: '🤖', output };
  } catch (err) {
    throw err;
  }
}

module.exports = { routeTask, RULES };
