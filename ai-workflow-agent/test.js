'use strict';
require('dotenv').config();

// ══════════════════════════════════════════
//   test.js — اختبار جميع النماذج
// ══════════════════════════════════════════

async function runTests() {
  const chalk = require('chalk');

  console.log(chalk.cyan('\n╔════════════════════════════════════════╗'));
  console.log(chalk.cyan('║   اختبار AI Workflow Agent v3.0        ║'));
  console.log(chalk.cyan('╚════════════════════════════════════════╝\n'));

  const tests = [
    {
      label: 'ScholarGPT (إلزامي)',
      fn: () => require('./agents/chatgpt').askScholarGPT('ما هو قانون نيوتن الأول؟')
    },
    {
      label: 'Groq Llama 3.3 (مجاني)',
      fn: () => require('./agents/free-models').askGroq('مرحباً، كيف حالك؟')
    },
    {
      label: 'Nano Banana / Gemma2 (مجاني)',
      fn: () => require('./agents/free-models').askNanoBanana('ما عاصمة المغرب؟')
    },
    {
      label: 'Gemini Flash (مجاني)',
      fn: () => require('./agents/free-models').askGemini('ما هو الذكاء الاصطناعي؟')
    },
    {
      label: 'DeepSeek R1 (مجاني)',
      fn: () => require('./agents/free-models').askDeepSeek('احسب: 15 × 8 + 32')
    },
    {
      label: 'Mistral Small (مجاني)',
      fn: () => require('./agents/free-models').askMistral('اذكر ثلاث نقاط عن الذكاء الاصطناعي')
    },
    {
      label: 'Cohere Command-R+ (مجاني)',
      fn: () => require('./agents/free-models').askCohere('لخّص مفهوم التعلم الآلي في جملتين')
    }
  ];

  let passed = 0, failed = 0;

  for (const t of tests) {
    process.stdout.write(chalk.yellow(`  اختبار ${t.label}... `));
    try {
      const r = await t.fn();
      const preview = String(r).replace(/\n/g,' ').slice(0, 70);
      console.log(chalk.green('✓') + chalk.gray(` ${preview}...`));
      passed++;
    } catch (e) {
      console.log(chalk.red('✗') + chalk.gray(` ${e.message}`));
      failed++;
    }
  }

  console.log(chalk.cyan(`\n══ النتيجة: ${passed} نجح، ${failed} فشل ══\n`));
  if (failed > 0) {
    console.log(chalk.yellow('تلميح: افتح ملف .env وضع مفاتيح API المجانية'));
    console.log(chalk.gray('  Groq:     https://console.groq.com'));
    console.log(chalk.gray('  Gemini:   https://aistudio.google.com'));
    console.log(chalk.gray('  DeepSeek: https://platform.deepseek.com\n'));
  }
}

runTests().catch(console.error);
