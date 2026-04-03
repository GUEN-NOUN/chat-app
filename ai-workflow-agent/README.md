# AI Workflow Agent v3.0

**ScholarGPT مدمج إلزامياً | عربي أولاً | مجاني 100%**

---

## التثبيت السريع

```bash
# 1. انسخ المجلد داخل مشروعك
cp -r ai-workflow-agent/ your-project/

# 2. ثبّت المكتبات
cd ai-workflow-agent
npm install

# 3. انسخ ملف الإعدادات
cp .env.example .env

# 4. ضع مفاتيحك في .env (المجانية كافية)

# 5. شغّل الاختبار
npm test

# 6. شغّل الخادم
npm start
```

---

## المفاتيح المجانية (مطلوبة)

| الخدمة    | الرابط                              | مجاني؟ |
|-----------|-------------------------------------|--------|
| Groq      | https://console.groq.com            | ✅ مجاني بالكامل |
| Gemini    | https://aistudio.google.com         | ✅ مجاني بحد يومي |
| DeepSeek  | https://platform.deepseek.com       | ✅ مجاني |
| Mistral   | https://console.mistral.ai          | ✅ مجاني |
| Cohere    | https://dashboard.cohere.com        | ✅ مجاني |

---

## الدمج مع صفحة HTML

```html
<!-- في صفحة HTML الخاصة بك -->
<script>
async function askAI(message, sessionId = 'user-1') {
  const res = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId })
  });
  const data = await res.json();
  return data.output; // الإجابة بالعربية
}

// مثال
askAI('اشرح قانون أوم').then(console.log);
</script>
```

---

## الدمج مع Node.js مشروعك

```javascript
// في أي ملف بمشروعك
const { routeTask } = require('./ai-workflow-agent/router');

// محادثة عادية
const result = await routeTask('مرحباً');
console.log(result.output); // إجابة بالعربية
console.log(result.model);  // اسم النموذج المستخدم

// سؤال امتحان → ScholarGPT تلقائياً
const exam = await routeTask('ما هي معادلة أينشتاين للطاقة؟');

// رفع ملف وتحليله
const { analyzeFile } = require('./ai-workflow-agent/tools/file-analyzer');
const fileData = await analyzeFile('/path/to/file.pdf');
const analysis = await routeTask(`حلل هذا المحتوى:\n${fileData.text}`);
```

---

## نقاط API الكاملة

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| POST | /api/chat | محادثة + تحليل صور |
| POST | /api/upload | رفع أي ملف |
| POST | /api/generate/pptx | إنشاء PowerPoint |
| POST | /api/generate/docx | إنشاء Word |
| POST | /api/generate/xlsx | إنشاء Excel |
| POST | /api/research | بحث علمي عميق |
| GET  | /api/models | حالة النماذج |
| GET  | /api/history/:id | تاريخ المحادثة |
| DELETE | /api/session/:id | مسح الجلسة |

---

## النماذج المدمجة

**مجانية:** Groq Llama 3.3 / Nano Banana (Gemma2) / Qwen 2.5 / Gemini Flash / Gemini Pro / DeepSeek R1 / Mistral / Cohere Command-R+

**مدفوعة (اختيارية):** ScholarGPT/GPT-4o / Claude Haiku
