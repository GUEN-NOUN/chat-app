'use strict';
// env loaded by server/index.js — no dotenv needed here

// ══════════════════════════════════════════
//   router.js — الموجّه الذكي الرئيسي
// ══════════════════════════════════════════

const { askScholarGPT, askChatGPT, analyzeImageGPT } = require('./agents/chatgpt');
const {
  askGroq, askNanoBanana, askQwen, askGroqVision,
  askGemini, askGeminiPro, askGeminiVision,
  askDeepSeek, askMistral, askCohere, askClaude
} = require('./agents/free-models');
const { withFallback } = require('./fallback');
const { askOpenRouter, askOpenRouterVision } = require('./agents/openrouter');

// ══ قواعد التوجيه الكاملة ══════════════════
const RULES = [

  // ── 1. ScholarGPT — أولوية قصوى للامتحانات ──
  {
    name: 'ScholarGPT',
    priority: 10,
    keywords: [
      'امتحان','اختبار','سؤال','حل المسألة','اشرح','شرح','درس','مادة',
      'فيزياء','كيمياء','رياضيات','أحياء','تاريخ','جغرافيا','أدب',
      'فلسفة','اقتصاد','هندسة','طب','قانون','واجب','تمرين','مسألة',
      'نظرية','قانون فيزيائي','معادلة','برهان','exam','test','homework',
      'scholar','academic','research paper','ما هو','ما هي','عرّف',
      'اذكر أسباب','اذكر مزايا','قارن بين','الفرق بين'
    ],
    fallbacks: [
      { name: 'ScholarGPT (GPT-4o)',  fn: (p,h) => askScholarGPT(p,h) },
      { name: 'Gemini Pro Academic',  fn: (p)   => askGeminiPro(p) },
      { name: 'DeepSeek R1',          fn: (p)   => askDeepSeek(p,true) },
      { name: 'Groq Llama Fallback',  fn: (p,h) => askGroq(p,h) }
    ]
  },

  // ── 2. تحليل الصور ──
  {
    name: 'Vision Analysis',
    priority: 9,
    keywords: ['حلل الصورة','describe image','ما في الصورة','انظر','image','vision','صورة'],
    isVision: true,
    fallbacks: [
      { name: 'GPT-4 Vision',              fn: (p,_,img) => analyzeImageGPT(p,img) },
      { name: 'Gemini Vision',             fn: (p,_,img) => askGeminiVision(p,img) },
      { name: 'Llama Vision (Groq)',        fn: (p,_,img) => askGroqVision(p,img) },
      { name: 'OpenRouter Nemotron Vision', fn: (p,_,img) => askOpenRouterVision(p,img) }
    ]
  },

  // ── 3. برمجة وكود ──
  {
    name: 'Code Assistant',
    priority: 8,
    keywords: [
      'كود','برمجة','function','def ','class ','import','require',
      'debug','خطأ في الكود','error','bug','script','python','javascript',
      'nodejs','react','vue','html','css','sql','api','docker','git'
    ],
    fallbacks: [
      { name: 'Claude Haiku',    fn: (p,h) => askClaude(p,h) },
      { name: 'GPT-4o Code',     fn: (p,h) => askChatGPT(p,'code',h) },
      { name: 'Groq Llama Code', fn: (p,h) => askGroq(p,h) },
      { name: 'DeepSeek Chat',   fn: (p)   => askDeepSeek(p,false) }
    ]
  },

  // ── 4. رياضيات ومنطق ──
  {
    name: 'Math & Logic',
    priority: 7,
    keywords: [
      'رياضيات','احسب','calculate','equation','integral','مشتقة',
      'تكامل','احتمال','matrix','منطق','برهان','proof','هندسة','جبر'
    ],
    fallbacks: [
      { name: 'DeepSeek R1',   fn: (p)   => askDeepSeek(p,true) },
      { name: 'ScholarGPT',    fn: (p,h) => askScholarGPT(p,h) },
      { name: 'Gemini Pro',    fn: (p)   => askGeminiPro(p) }
    ]
  },

  // ── 5. إنشاء عرض تقديمي ──
  {
    name: 'Presentation Builder',
    priority: 6,
    keywords: [
      'عرض تقديمي','بوربوينت','powerpoint','pptx','slides','شرائح',
      'اصنع عرض','أنشئ عرض','presentation'
    ],
    isPPTX: true,
    fallbacks: [
      { name: 'GPT-4o Presenter', fn: (p,h) => askChatGPT(p,'default',h) },
      { name: 'Gemini Pro',       fn: (p)   => askGeminiPro(p) },
      { name: 'Groq Llama',       fn: (p,h) => askGroq(p,h) }
    ]
  },

  // ── 6. إنشاء Word / تقارير ──
  {
    name: 'Document Builder',
    priority: 6,
    keywords: [
      'وورد','word','docx','تقرير','report','مستند','document',
      'اكتب تقرير','أنشئ مستند','اصنع ورقة'
    ],
    isDOCX: true,
    fallbacks: [
      { name: 'GPT-4o Writer', fn: (p,h) => askChatGPT(p,'default',h) },
      { name: 'Cohere Writer', fn: (p)   => askCohere(p) },
      { name: 'Gemini Pro',    fn: (p)   => askGeminiPro(p) }
    ]
  },

  // ── 7. إنشاء Excel / جداول ──
  {
    name: 'Spreadsheet Builder',
    priority: 6,
    keywords: ['اكسل','excel','xlsx','جدول','table','spreadsheet','بيانات جدولية'],
    isXLSX: true,
    fallbacks: [
      { name: 'GPT-4o Excel',  fn: (p,h) => askChatGPT(p,'default',h) },
      { name: 'Groq Llama',    fn: (p,h) => askGroq(p,h) }
    ]
  },

  // ── 8. بحث علمي عميق (NotebookLM style) ──
  {
    name: 'Deep Research',
    priority: 5,
    keywords: [
      'بحث علمي','ورقة بحثية','ابحث في','deep research','literature review',
      'مراجعة أدبيات','summarize paper','لخص البحث','notebook','podcast من'
    ],
    fallbacks: [
      { name: 'ScholarGPT Deep', fn: (p,h) => askScholarGPT(p,h) },
      { name: 'Gemini Pro',      fn: (p)   => askGeminiPro(p) },
      { name: 'Cohere Research', fn: (p)   => askCohere(p) },
      { name: 'DeepSeek R1',     fn: (p)   => askDeepSeek(p,true) }
    ]
  },

  // ── 9. تلخيص ملفات/محتوى ──
  {
    name: 'Summarizer',
    priority: 5,
    keywords: [
      'لخص','ملخص','summarize','summary','خلاصة','اختصر','podcast',
      'خريطة ذهنية','mind map','أعد صياغة'
    ],
    fallbacks: [
      { name: 'Cohere Summarize', fn: (p) => askCohere(p) },
      { name: 'Gemini Flash',     fn: (p) => askGemini(p) },
      { name: 'Mistral',          fn: (p) => askMistral(p) },
      { name: 'Groq Llama',       fn: (p,h) => askGroq(p,h) }
    ]
  },

  // ── 10. ترجمة ──
  {
    name: 'Translator',
    priority: 4,
    keywords: ['ترجم','translate','translation','بالإنجليزية','بالعربية','بالفرنسية'],
    fallbacks: [
      { name: 'GPT-4o Translate', fn: (p,h) => askChatGPT(p,'default',h) },
      { name: 'Cohere',           fn: (p)   => askCohere(p) },
      { name: 'Gemini Flash',     fn: (p)   => askGemini(p) }
    ]
  },

  // ── 11. سريع / بسيط ──
  {
    name: 'Fast Response',
    priority: 3,
    keywords: ['سريع','quick','بسيط','مختصر','brief','قصير'],
    fallbacks: [
      { name: 'Groq Llama (Fast)', fn: (p,h) => askGroq(p,h) },
      { name: 'Nano Banana',       fn: (p)   => askNanoBanana(p) },
      { name: 'Gemini Flash',      fn: (p)   => askGemini(p) }
    ]
  },

  // ── 12. لغة عربية / أدب ──
  {
    name: 'Arabic Language',
    priority: 3,
    keywords: ['نحو','صرف','أدب عربي','قصيدة','نص أدبي','تحليل نص','عروض'],
    fallbacks: [
      { name: 'Qwen 2.5 (Arabic)', fn: (p)   => askQwen(p) },
      { name: 'ScholarGPT',        fn: (p,h) => askScholarGPT(p,h) },
      { name: 'GPT-4o',            fn: (p,h) => askChatGPT(p,'default',h) }
    ]
  }
];

async function routeTask(input, history = [], imageBase64 = null) {
  const lower = input.toLowerCase();

  // إذا كانت هناك صورة → Vision مباشرة
  if (imageBase64) {
    const visionRule = RULES.find(r => r.name === 'Vision Analysis');
    return withFallback(
      visionRule.fallbacks.map(f => ({
        name: f.name,
        fn: (p, h) => f.fn(p, h, imageBase64)
      })),
      input, history, imageBase64
    );
  }

  const sorted = [...RULES].sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    const hits = rule.keywords.filter(kw => lower.includes(kw.toLowerCase()));
    if (hits.length > 0) {
      console.log(`  → [${rule.name}] (${hits.slice(0,2).join(', ')})`);
      const result = await withFallback(rule.fallbacks, input, history);
      return { ...result, intent: rule.name };
    }
  }

  // افتراضي
  console.log('  → [General Chat] افتراضي');
  const result = await withFallback([
    { name: 'GPT-4o',      fn: (p,h) => askChatGPT(p,'default',h) },
    { name: 'Gemini Flash', fn: (p)  => askGemini(p) },
    { name: 'Groq Llama',  fn: (p,h) => askGroq(p,h) },
    { name: 'Mistral',     fn: (p)   => askMistral(p) }
  ], input, history);
  return { ...result, intent: 'general' };
}

// ══ جدول النماذج المتاحة للاختيار اليدوي ══════════════
const MODEL_HANDLERS = {
  'gemini-flash':        (p, h)      => askGemini(p, 'gemini-2.0-flash'),
  'gemini-pro':          (p, h)      => askGeminiPro(p),
  'gemini-vision':       (p, h, img) => askGeminiVision(p, img),
  'groq-llama':          (p, h)      => askGroq(p, h, 'llama-3.3-70b-versatile'),
  'groq-vision':         (p, h, img) => askGroqVision(p, img),
  'qwen':                (p, h)      => askQwen(p, h),
  'scholar':             (p, h)      => askScholarGPT(p, h),
  'deepseek':            (p, h)      => askDeepSeek(p, true),
  'deepseek-chat':       (p, h)      => askDeepSeek(p, false),
  'claude':              (p, h)      => askClaude(p, h),
  'cohere':              (p, h)      => askCohere(p),
  'mistral':             (p, h)      => askMistral(p),
  'openrouter-llama':    (p, h)      => askOpenRouter(p, 'meta-llama/llama-3.3-70b-instruct:free'),
  'openrouter-qwen3':    (p, h)      => askOpenRouter(p, 'qwen/qwen3-235b-a22b:free'),
  'openrouter-deepseek': (p, h)      => askOpenRouter(p, 'deepseek/deepseek-r1-0528:free'),
  'openrouter-gemma':    (p, h)      => askOpenRouter(p, 'google/gemma-3-27b-it:free'),
};

/**
 * توجيه مباشر لنموذج معين — يتجاوز التوجيه التلقائي.
 * @param {string} modelId
 * @param {string} input
 * @param {Array}  history
 * @param {string|null} imageBase64
 */
async function forceRoute(modelId, input, history = [], imageBase64 = null) {
  const handler = MODEL_HANDLERS[modelId];
  if (!handler) {
    console.log(`  → [forceRoute] "${modelId}" غير معروف — fallback تلقائي`);
    return routeTask(input, history, imageBase64);
  }
  console.log(`  → [forceRoute] ${modelId}`);
  try {
    const output = await handler(input, history, imageBase64);
    const label  = modelId;
    return { output, model: label, intent: 'manual' };
  } catch (err) {
    console.warn(`  [forceRoute] ${modelId} فشل (${err.message}) — تبديل تلقائي`);
    return routeTask(input, history, imageBase64);
  }
}

module.exports = { routeTask, forceRoute, MODEL_HANDLERS, RULES };
