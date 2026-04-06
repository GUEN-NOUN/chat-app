'use strict';
// env loaded by server/index.js — no dotenv needed here

// ══════════════════════════════════════════
//   orchestrator.js — نقطة الدخول الرئيسية
// ══════════════════════════════════════════

const { routeTask, forceRoute, MODEL_HANDLERS, RULES } = require('./router');
const { MemoryStore }       = require('./memory');
const { detectDocCommand, generateDocument }     = require('./agents/docgen');
const { detectNotebookLMCommand, askNotebookLM, streamNotebookLM } = require('./agents/notebooklm');

const memory = new MemoryStore();

/**
 * نقطة الدخول الرئيسية للذكاء الاصطناعي.
 * @param {string}      userInput
 * @param {string}      [sessionId]
 * @param {object|null} [mediaData]   — { type:'image'|'audio', base64, mimeType }
 * @param {Function}    [onToken]     — تستقبل كل جزء نصي عند التدفق التدريجي
 */
async function runOrchestrator(userInput, sessionId, mediaData, forceModel, onToken) {
  sessionId = sessionId || 'default';
  const mediaLabel = mediaData ? ' | media=' + mediaData.type : '';
  console.log('\n🧠 Workflow | session=' + sessionId + mediaLabel + ' | "' + userInput.slice(0, 60) + '"');

  // memory.js الجديد: getHistory(id) تُرجع آخر 16 رسالة
  const history = await memory.getHistory(sessionId);

  // ── 1. توليد PPTX / DOCX ────────────────────────────────────
  if (!mediaData) {
    const docCmd = detectDocCommand(userInput);
    if (docCmd.matched) {
      console.log('  → 📎 DocGen ' + docCmd.format.toUpperCase() + ': ' + docCmd.topic);
      try {
        const doc    = await generateDocument(docCmd.topic, docCmd.format);
        const output = '✅ تم إنشاء الملف!\n📎 **' + docCmd.format.toUpperCase() + '**: [' + doc.fileName + '](' + doc.url + ')';
        await _save(sessionId, userInput, output, 'DocGen');
        return { output, model: 'DocGen-' + docCmd.format.toUpperCase(), emoji: '📎' };
      } catch (err) { console.warn('  DocGen error:', err.message); }
    }

    // ── 2. تحليل NotebookLM ───────────────────────────────────
    const nbCmd = detectNotebookLMCommand(userInput);
    if (nbCmd.matched) {
      console.log('  → 📓 NotebookLM mode=' + nbCmd.mode + (onToken ? ' [streaming]' : ''));
      try {
        const out = onToken
          ? await streamNotebookLM(nbCmd.content, nbCmd.mode, onToken)
          : await askNotebookLM(nbCmd.content, nbCmd.mode);
        if (out && out.trim().length > 10) {
          await _save(sessionId, userInput, out, 'NotebookLM');
          return { output: onToken ? '' : out, model: 'NotebookLM', emoji: '📓', streamed: !!onToken };
        }
      } catch (err) { console.warn('  NotebookLM error:', err.message); }
    }
  }

  // ── 3. توجيه — يدوي أو تلقائي ────────────────────────────
  const imageBase64 = (mediaData && mediaData.type === 'image') ? mediaData.base64 : null;
  const result = (forceModel && forceModel !== 'auto')
    ? await forceRoute(forceModel, userInput, history, imageBase64)
    : await routeTask(userInput, history, imageBase64);

  // ── 4. معالجة الصوت ────────────────────────────────────────
  if (mediaData && mediaData.type === 'audio') {
    try {
      const { askGeminiAudio } = require('./agents/free-models');
      const transcript = await askGeminiAudio(mediaData.base64, mediaData.mimeType);
      if (transcript && transcript.trim().length > 2) {
        const ar = await routeTask(transcript, history);
        const output = '🎤 *نص الصوت:*\n' + transcript + '\n\n---\n\n' + ar.output;
        await _save(sessionId, userInput, output, ar.model);
        return { output, model: ar.model, emoji: '🎤', intent: ar.intent };
      }
    } catch (e) { console.warn('  Audio failed:', e.message); }
  }

  await _save(sessionId, userInput, result.output, result.model);
  console.log('  ✅ [' + (result.intent || 'general') + '] ' + result.model + ' → ' + result.output.length + ' chars');
  // ── 5. تدفق word-by-word للنماذج التي لا تدعم streaming مدمج ──────────────
  if (onToken && result.output) {
    const words = result.output.split(/(\s+)/);
    for (const w of words) {
      if (w) onToken(w);
      await new Promise(r => (typeof setImmediate !== 'undefined' ? setImmediate(r) : setTimeout(r, 0)));
    }
    return { output: '', model: result.model, emoji: _emoji(result.intent), intent: result.intent, streamed: true };
  }
  return { output: result.output, model: result.model, emoji: _emoji(result.intent), intent: result.intent };
}

// memory.js الجديد: push(id, role, content) — وليس pushHistory
async function _save(sessionId, input, output, model) {
  await memory.push(sessionId, 'user',      input);
  await memory.push(sessionId, 'assistant', output);
  await memory.setMeta(sessionId, 'lastModel', model);
  await memory.setMeta(sessionId, 'lastInput', input);
}

function _emoji(intent) {
  const map = {
    'ScholarGPT': '🎓', 'Vision Analysis': '🔍', 'Code Assistant': '💻',
    'Math & Logic': '🧮', 'Presentation Builder': '📊', 'Document Builder': '📝',
    'Spreadsheet Builder': '📋', 'Deep Research': '📚', 'Summarizer': '📋',
    'Translator': '🌐', 'Fast Response': '⚡', 'Arabic Language': '🔤', 'general': '🤖',
  };
  return map[intent] || '🤖';
}

function getAvailableAgents() {
  const base = RULES.map(r => ({ name: r.name, emoji: _emoji(r.name), keywords: r.keywords.slice(0, 4) }));
  base.push(
    { name: 'NotebookLM', emoji: '📓', keywords: ['ملاحظات', 'تحليل', 'notebooklm', 'بودكاست'] },
    { name: 'DocGen',     emoji: '📎', keywords: ['عرض', 'مستند', 'pptx', 'docx'] },
    { name: 'Vision',     emoji: '🔍', keywords: ['صورة', 'تحليل صورة'] },
    { name: 'Audio',      emoji: '🎤', keywords: ['صوت', 'تسجيل'] }
  );
  return base;
}

async function testAll() {
  const probe = 'ما عاصمة المغرب؟';
  const { askOpenRouter } = require('./agents/openrouter');
  const { askGemini, askGroq, askDeepSeek } = require('./agents/free-models');
  const { askScholarGPT } = require('./agents/chatgpt');

  const agents = [
    { name: 'OpenRouter-Qwen',  fn: () => askOpenRouter(probe, 'qwen/qwen3.6-plus-preview:free') },
    { name: 'OpenRouter-Llama', fn: () => askOpenRouter(probe, 'meta-llama/llama-3.3-70b-instruct:free') },
    { name: 'Gemini',           fn: () => askGemini(probe) },
    { name: 'Groq',             fn: () => askGroq(probe) },
    { name: 'DeepSeek',         fn: () => askDeepSeek(probe, false) },
    { name: 'ScholarGPT',       fn: () => askScholarGPT(probe) },
  ];

  const results = [];
  for (const a of agents) {
    try {
      const out = await a.fn();
      results.push({ name: a.name, status: 'ok', preview: out.slice(0, 60) });
      console.log('  ✅ ' + a.name);
    } catch (err) {
      results.push({ name: a.name, status: 'fail', error: err.message });
      console.log('  ❌ ' + a.name + ': ' + err.message);
    }
  }
  return results;
}

module.exports = { runOrchestrator, getAvailableAgents, testAll, MODEL_HANDLERS };
