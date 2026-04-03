'use strict';
require('dotenv').config();

// ══════════════════════════════════════════
//   index.js — الخادم الرئيسي Express
//   يعمل مع أي صفحة HTML أو Node.js app
// ══════════════════════════════════════════

const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuid } = require('uuid');

const { routeTask }       = require('./router');
const { MemoryStore }     = require('./memory');
const { analyzeFile }     = require('./tools/file-analyzer');
const { generatePPTX, generateDOCX, generateXLSX } = require('./tools/generators');

const app    = express();
const memory = new MemoryStore();
const PORT   = process.env.PORT || 3001;
const UPLOAD = process.env.UPLOAD_DIR || 'public/uploads';

// ── Middleware ──────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, UPLOAD)));

fs.mkdirSync(path.join(__dirname, UPLOAD), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public/outputs'), { recursive: true });

// ── رفع الملفات ─────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, UPLOAD)),
  filename:    (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 }
});

// ══ ROUTES ════════════════════════════════

// ── GET / — معلومات الـ API ──────────────
app.get('/', (_, res) => {
  res.json({
    name:    'AI Workflow Agent v3.0',
    status:  'running',
    arabic:  true,
    scholar: true,
    endpoints: {
      chat:     'POST /api/chat',
      upload:   'POST /api/upload',
      pptx:     'POST /api/generate/pptx',
      docx:     'POST /api/generate/docx',
      xlsx:     'POST /api/generate/xlsx',
      research: 'POST /api/research',
      models:   'GET  /api/models',
      clear:    'DELETE /api/session/:id'
    }
  });
});

// ── POST /api/chat — المحادثة الرئيسية ──
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default', imageBase64 } = req.body;
    if (!message && !imageBase64) {
      return res.status(400).json({ error: 'message مطلوب' });
    }

    const history = await memory.getHistory(sessionId);
    const result  = await routeTask(message || 'حلل هذه الصورة', history, imageBase64 || null);

    await memory.push(sessionId, 'user',      message || '[صورة]');
    await memory.push(sessionId, 'assistant', result.output);

    res.json({
      success:   true,
      output:    result.output,
      model:     result.model,
      intent:    result.intent,
      sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[/api/chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/upload — رفع وتحليل ملف ──
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع ملف' });

    const { sessionId = 'default', question } = req.body;
    const filePath = req.file.path;

    // تحليل الملف
    const fileData = await analyzeFile(filePath);

    let result;
    if (fileData.type === 'image') {
      // صورة → Vision
      const prompt = question || 'حلل هذه الصورة بالتفصيل';
      result = await routeTask(prompt, await memory.getHistory(sessionId), fileData.base64);
    } else {
      // ملف نصي → إرسال المحتوى للنموذج
      const prompt = question
        ? `${question}\n\n=== محتوى الملف ===\n${fileData.text}`
        : `حلل هذا الملف وقدم ملخصاً شاملاً:\n\n${fileData.text}`;
      result = await routeTask(prompt, await memory.getHistory(sessionId));
    }

    await memory.push(sessionId, 'user',      `[ملف: ${req.file.originalname}] ${question || ''}`);
    await memory.push(sessionId, 'assistant', result.output);

    // حذف الملف بعد التحليل
    fs.unlink(filePath, () => {});

    res.json({
      success:   true,
      output:    result.output,
      model:     result.model,
      fileType:  fileData.type,
      fileName:  req.file.originalname,
      sessionId
    });
  } catch (err) {
    console.error('[/api/upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate/pptx ───────────────
app.post('/api/generate/pptx', async (req, res) => {
  try {
    const { topic, sessionId = 'default', slidesCount = 8 } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic مطلوب' });

    // اطلب من ScholarGPT إنشاء محتوى الشرائح
    const { askScholarGPT } = require('./agents/chatgpt');
    const prompt = `أنشئ محتوى عرض تقديمي عن: "${topic}"
عدد الشرائح: ${slidesCount}
أجب بـ JSON فقط بهذا الشكل بالضبط (لا تضف أي نص قبله أو بعده):
[
  {"title":"عنوان الشريحة","content":"محتوى مختصر","bullets":["نقطة 1","نقطة 2","نقطة 3"]},
  ...
]`;

    const raw = await askScholarGPT(prompt);
    let slides;
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      slides = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      slides = [{ title: topic, content: raw.slice(0, 500), bullets: [] }];
    }

    const outputPath = path.join(__dirname, 'public/outputs', `pptx-${Date.now()}.pptx`);
    await generatePPTX(slides, outputPath);

    const fileUrl = `/outputs/${path.basename(outputPath)}`;
    res.json({ success: true, fileUrl, slidesCount: slides.length, model: 'ScholarGPT + PPTX' });
  } catch (err) {
    console.error('[/api/generate/pptx]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate/docx ───────────────
app.post('/api/generate/docx', async (req, res) => {
  try {
    const { topic, content, sessionId = 'default' } = req.body;
    if (!topic && !content) return res.status(400).json({ error: 'topic أو content مطلوب' });

    let docContent = content;
    if (!docContent) {
      const { askScholarGPT } = require('./agents/chatgpt');
      docContent = await askScholarGPT(
        `اكتب مستند Word كامل ومفصل عن: "${topic}"\nاستخدم # للعناوين الرئيسية و## للعناوين الفرعية و- للنقاط`
      );
    }

    const outputPath = path.join(__dirname, 'public/outputs', `docx-${Date.now()}.docx`);
    await generateDOCX(docContent, outputPath);

    const fileUrl = `/outputs/${path.basename(outputPath)}`;
    res.json({ success: true, fileUrl, model: 'ScholarGPT + DOCX' });
  } catch (err) {
    console.error('[/api/generate/docx]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate/xlsx ───────────────
app.post('/api/generate/xlsx', async (req, res) => {
  try {
    const { topic, data } = req.body;
    if (!topic && !data) return res.status(400).json({ error: 'topic أو data مطلوب' });

    let xlsxData = data;
    if (!xlsxData) {
      const { askChatGPT } = require('./agents/chatgpt');
      const raw = await askChatGPT(
        `أنشئ بيانات جدولية عن: "${topic}"\nأجب بـ CSV فقط (فاصلة بين الأعمدة، سطر جديد بين الصفوف). أضف صف العناوين أولاً.`,
        'default'
      );
      xlsxData = raw;
    }

    const outputPath = path.join(__dirname, 'public/outputs', `xlsx-${Date.now()}.xlsx`);
    await generateXLSX(xlsxData, outputPath);

    const fileUrl = `/outputs/${path.basename(outputPath)}`;
    res.json({ success: true, fileUrl, model: 'GPT-4o + XLSX' });
  } catch (err) {
    console.error('[/api/generate/xlsx]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/research — بحث علمي عميق ──
app.post('/api/research', async (req, res) => {
  try {
    const { query, depth = 'standard', sessionId = 'default' } = req.body;
    if (!query) return res.status(400).json({ error: 'query مطلوب' });

    const { askScholarGPT } = require('./agents/chatgpt');
    const { askGeminiPro }  = require('./agents/free-models');
    const { askDeepSeek }   = require('./agents/free-models');

    const prompt = `بحث علمي عميق عن: "${query}"

أريد تقريراً شاملاً يتضمن:
1. مقدمة ونظرة عامة
2. الخلفية والمفاهيم الأساسية
3. أبرز الدراسات والنظريات
4. التطورات الحديثة
5. التطبيقات العملية
6. التحديات والمستقبل
7. المراجع والمصادر المقترحة

اجعل التقرير باللغة العربية ومفصلاً.`;

    // بحث متوازٍ من عدة نماذج
    const results = await Promise.allSettled([
      askScholarGPT(prompt),
      depth === 'deep' ? askGeminiPro(prompt) : Promise.resolve(null),
      depth === 'deep' ? askDeepSeek(prompt, true) : Promise.resolve(null)
    ]);

    const outputs = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    // دمج النتائج
    let finalOutput;
    if (outputs.length > 1) {
      const { askChatGPT } = require('./agents/chatgpt');
      finalOutput = await askChatGPT(
        `ادمج هذه البحوث في تقرير واحد متكامل:\n\n${outputs.map((o,i) => `=== مصدر ${i+1} ===\n${o}`).join('\n\n')}`,
        'scholar'
      ).catch(() => outputs[0]);
    } else {
      finalOutput = outputs[0] || 'لم نتمكن من إجراء البحث';
    }

    await memory.push(sessionId, 'user',      `[بحث علمي] ${query}`);
    await memory.push(sessionId, 'assistant', finalOutput);

    res.json({ success: true, output: finalOutput, model: 'ScholarGPT + Multi-Source', query });
  } catch (err) {
    console.error('[/api/research]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/models — قائمة النماذج ────────
app.get('/api/models', (_, res) => {
  const hasKey = k => !!(process.env[k] && !process.env[k].includes('REPLACE') && process.env[k].length > 5);
  res.json({
    free: [
      { name: 'Groq Llama 3.3',    available: hasKey('GROQ_API_KEY'),    cost: 'مجاني' },
      { name: 'Nano Banana (Gemma)',available: hasKey('GROQ_API_KEY'),    cost: 'مجاني' },
      { name: 'Qwen 2.5',          available: hasKey('GROQ_API_KEY'),    cost: 'مجاني' },
      { name: 'Gemini Flash',       available: hasKey('GEMINI_API_KEY'),  cost: 'مجاني' },
      { name: 'Gemini Pro',         available: hasKey('GEMINI_API_KEY'),  cost: 'مجاني' },
      { name: 'DeepSeek R1',        available: hasKey('DEEPSEEK_API_KEY'),cost: 'مجاني' },
      { name: 'Mistral Small',      available: hasKey('MISTRAL_API_KEY'), cost: 'مجاني' },
      { name: 'Cohere Command-R+',  available: hasKey('COHERE_API_KEY'),  cost: 'مجاني' }
    ],
    premium: [
      { name: 'ScholarGPT (GPT-4o)',available: hasKey('OPENAI_API_KEY'),     cost: 'مدفوع' },
      { name: 'GPT-4o',             available: hasKey('OPENAI_API_KEY'),     cost: 'مدفوع' },
      { name: 'Claude Haiku',       available: hasKey('ANTHROPIC_API_KEY'),  cost: 'مدفوع' }
    ],
    capabilities: ['chat','vision','scholar','pptx','docx','xlsx','research','summarize','translate']
  });
});

// ── GET /api/history/:id — تاريخ الجلسة ──
app.get('/api/history/:sessionId', async (req, res) => {
  const history = await memory.getHistory(req.params.sessionId);
  res.json({ sessionId: req.params.sessionId, history, count: history.length });
});

// ── DELETE /api/session/:id ───────────────
app.delete('/api/session/:sessionId', async (req, res) => {
  await memory.clear(req.params.sessionId);
  res.json({ success: true, message: 'تم مسح الجلسة' });
});

// ── Static outputs ────────────────────────
app.use('/outputs', express.static(path.join(__dirname, 'public/outputs')));

// ── تشغيل الخادم ──────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  🤖 AI Workflow Agent v3.0 — يعمل الآن    ║`);
  console.log(`║  http://localhost:${PORT}                      ║`);
  console.log(`║  ScholarGPT مدمج | عربي | ${Object.keys(process.env).filter(k=>k.endsWith('_KEY')&&process.env[k]&&!process.env[k].includes('REPLACE')).length} مفاتيح نشطة ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
});

module.exports = app; // للدمج مع مشروعك
