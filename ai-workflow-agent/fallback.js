'use strict';

// ══════════════════════════════════════════
//   fallback.js — تجربة النماذج بالترتيب
//   + OpenRouter كـ fallback نهائي مضمون
// ══════════════════════════════════════════

// أفضل نماذج OpenRouter المجانية للـ fallback النهائي
const OPENROUTER_FALLBACKS = [
  'qwen/qwen3.6-plus-preview:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'stepfun/step-3.5-flash:free',
  'google/gemma-3-27b-it:free',
  'minimax/minimax-m2.5:free',
];

// نماذج الرؤية المجانية على OpenRouter
const OPENROUTER_VISION_FALLBACKS = [
  'google/gemma-3-12b-it:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-4b-it:free',
];

async function withFallback(handlers, prompt, history = [], imageBase64 = null) {
  const errors = [];

  // تجربة كل handler بالترتيب
  for (const { name, fn } of handlers) {
    try {
      console.log('  ⟳ جاري: ' + name);
      const result = await Promise.race([
        fn(prompt, history),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 30s')), 30000))
      ]);
      if (result && String(result).trim().length > 3) {
        console.log('  ✓ نجح: ' + name);
        return { output: String(result), model: name };
      }
    } catch (err) {
      errors.push(name + ': ' + err.message);
      console.warn('  ✗ فشل ' + name + ': ' + err.message);
    }
  }

  // ── Fallback نهائي عند وجود صورة: OpenRouter Vision ──
  if (imageBase64) {
    console.log('  ↪ OpenRouter Vision fallback chain...');
    try {
      const { askOpenRouter } = require('./agents/openrouter');
      const mime = 'image/jpeg';
      const visionMessages = [
        { role: 'system', content: 'أنت محلل صور ذكي. حلّل الصورة بدقة واذكر كل التفاصيل باللغة العربية.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt || 'حلل هذه الصورة بالتفصيل' },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } }
          ]
        }
      ];
      for (const model of OPENROUTER_VISION_FALLBACKS) {
        try {
          console.log('  ⟳ OpenRouter Vision → ' + model.split('/').pop());
          const out = await askOpenRouter(visionMessages, model, null, { max_tokens: 3000 });
          if (out && out.trim().length > 3) {
            console.log('  ✓ OpenRouter Vision نجح: ' + model.split('/').pop());
            return { output: out, model: model.split('/').pop().replace(':free', '') };
          }
        } catch (e) {
          errors.push(model.split('/').pop() + ': ' + e.message);
          console.warn('  ✗ فشل Vision ' + model.split('/').pop() + ': ' + e.message);
        }
      }
    } catch (e) {
      errors.push('OpenRouter Vision: ' + e.message);
    }
  }

  // ── إذا كانت هناك صورة وفشلت كل نماذج الرؤية: لا نرسل لنموذج نصي ──
  if (imageBase64) {
    return {
      output: '⚠️ تعذّر تحليل الصورة حالياً بسبب تجاوز حدود النماذج المجانية. يرجى المحاولة بعد دقيقة، أو اكتب وصفاً للصورة وسأساعدك.',
      model: 'unavailable'
    };
  }

  // ── Fallback نهائي: OpenRouter النصي المجاني ──
  console.log('  ↪ OpenRouter text fallback chain...');
  try {
    const { askOpenRouter } = require('./agents/openrouter');
    for (const model of OPENROUTER_FALLBACKS) {
      try {
        console.log('  ⟳ OpenRouter → ' + model.split('/').pop());
        const out = await askOpenRouter(prompt, model, null, { max_tokens: 3000 });
        if (out && out.trim().length > 3) {
          console.log('  ✓ OpenRouter نجح: ' + model.split('/').pop());
          return { output: out, model: model.split('/').pop().replace(':free', '') };
        }
      } catch (e) {
        errors.push(model.split('/').pop() + ': ' + e.message);
      }
    }
  } catch (e) {
    errors.push('OpenRouter: ' + e.message);
  }

  return {
    output: '⚠️ جميع النماذج غير متاحة حالياً.\n\nالأخطاء:\n' + errors.slice(0, 5).join('\n'),
    model: 'unavailable'
  };
}

module.exports = { withFallback };
