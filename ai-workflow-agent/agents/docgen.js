'use strict';
// Document generation agent — PPTX and DOCX using AI-generated content
const path = require('path');
const fs   = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'server', 'uploads');

// ── Shared: use AI to generate document structure ─────────────
async function buildStructure(topic, format) {
  const { askOpenRouter } = require('./openrouter');

  const prompt = format === 'pptx'
    ? `\u0623\u0646\u0634\u0626 \u0645\u062d\u062a\u0648\u0649 \u0639\u0631\u0636 \u062a\u0642\u062f\u064a\u0645\u064a \u0644\u0640: "${topic}"\n\u0623\u0639\u0637\u0646\u064a JSON \u0628\u0627\u0644\u0634\u0643\u0644 \u0627\u0644\u062a\u0627\u0644\u064a \u062f\u0648\u0646 \u0623\u064a \u0646\u0635 \u062e\u0627\u0631\u062c JSON:\n{"title":"\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0639\u0631\u0636","subtitle":"\u0639\u0646\u0648\u0627\u0646 \u0641\u0631\u0639\u064a","slides":[{"title":"\u0639\u0646\u0648\u0627\u0646","bullets":["\u0646\u0642\u0637\u0629 1","\u0646\u0642\u0637\u0629 2"]}]}\n\u0623\u0646\u0634\u0626 6-8 \u0634\u0631\u0627\u0626\u062d \u0628\u0645\u062d\u062a\u0648\u0649 \u062a\u0639\u0644\u064a\u0645\u064a \u062d\u0642\u064a\u0642\u064a.`
    : `\u0623\u0646\u0634\u0626 \u0645\u062d\u062a\u0648\u0649 \u0645\u0633\u062a\u0646\u062f \u0648\u0648\u0631\u062f \u0639\u0646: "${topic}"\n\u0623\u0639\u0637\u0646\u064a JSON \u0628\u0627\u0644\u0634\u0643\u0644 \u0627\u0644\u062a\u0627\u0644\u064a \u062f\u0648\u0646 \u0623\u064a \u0646\u0635 \u062e\u0627\u0631\u062c JSON:\n{"title":"\u0639\u0646\u0648\u0627\u0646","sections":[{"heading":"\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0641\u0635\u0644","paragraphs":["\u0641\u0642\u0631\u0629 1","\u0641\u0642\u0631\u0629 2"]}]}\n\u0623\u0646\u0634\u0626 4-6 \u0641\u0635\u0648\u0644 \u0628\u0645\u062d\u062a\u0648\u0649 \u062a\u0639\u0644\u064a\u0645\u064a \u062d\u0642\u064a\u0642\u064a.`;

  try {
    const raw = await askOpenRouter(prompt, 'qwen/qwen3.6-plus-preview:free', null, { max_tokens: 2500, temperature: 0.6 });
    const m   = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON');
    return JSON.parse(m[0]);
  } catch {
    // Safe fallback structure
    return format === 'pptx'
      ? { title: topic, subtitle: '\u0645\u062f\u0627\u0631\u0643 \u0627\u0644\u062a\u0639\u0644\u064a\u0645\u064a\u0629', slides: [
          { title: '\u0645\u0642\u062f\u0645\u0629', bullets: ['\u062a\u0639\u0631\u064a\u0641 \u0627\u0644\u0645\u0648\u0636\u0648\u0639', '\u0623\u0647\u0645\u064a\u062a\u0647'] },
          { title: '\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0631\u0626\u064a\u0633\u064a', bullets: ['\u0627\u0644\u0646\u0642\u0637\u0629 \u0627\u0644\u0623\u0648\u0644\u0649', '\u0627\u0644\u0646\u0642\u0637\u0629 \u0627\u0644\u062b\u0627\u0646\u064a\u0629'] },
          { title: '\u0627\u0644\u062e\u0644\u0627\u0635\u0629', bullets: ['\u0623\u0628\u0631\u0632 \u0627\u0644\u0646\u0642\u0627\u0637', '\u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a'] },
        ] }
      : { title: topic, sections: [
          { heading: '\u0645\u0642\u062f\u0645\u0629',          paragraphs: ['\u064a\u062a\u0646\u0627\u0648\u0644 \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u062a\u0646\u062f \u0645\u0648\u0636\u0648\u0639: ' + topic] },
          { heading: '\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644',        paragraphs: ['\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u062a\u0641\u0635\u064a\u0644\u064a \u0644\u0644\u0645\u0648\u0636\u0648\u0639.'] },
          { heading: '\u0627\u0644\u062e\u0644\u0627\u0635\u0629 \u0648\u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a', paragraphs: ['\u062e\u0644\u0627\u0635\u0629 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 \u0648\u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a.'] },
        ] };
  }
}

// ── PPTX Generator ─────────────────────────────────────────────
async function generatePPTX(topic) {
  const PptxGenJS = require('pptxgenjs');
  const data = await buildStructure(topic, 'pptx');

  const pptx = new PptxGenJS();
  pptx.rtlMode = true;
  pptx.layout  = 'LAYOUT_WIDE';

  // Title slide
  const ts = pptx.addSlide();
  ts.background = { color: '0d1b2a' };
  ts.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '0d1b2a' } });
  ts.addText(data.title || topic, {
    x: 0.5, y: 2.0, w: '90%', h: 1.5, align: 'center',
    fontSize: 44, bold: true, color: 'ffffff', rtlMode: true,
  });
  ts.addText(data.subtitle || '\u0645\u062f\u0627\u0631\u0643 \u0627\u0644\u062a\u0639\u0644\u064a\u0645\u064a\u0629', {
    x: 0.5, y: 3.8, w: '90%', h: 0.6, align: 'center',
    fontSize: 20, color: 'e94560', rtlMode: true,
  });

  // Content slides
  for (const slide of (data.slides || [])) {
    const s = pptx.addSlide();
    s.background = { color: '16213e' };

    // Header bar
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 1.1, fill: { color: 'e94560' } });
    s.addText(slide.title || '', {
      x: 0.3, y: 0.15, w: '95%', h: 0.8, align: 'right',
      fontSize: 26, bold: true, color: 'ffffff', rtlMode: true,
    });

    const bullets = (slide.bullets || []).map(b => ({
      text: b,
      options: { bullet: { indent: 20 }, fontSize: 18, color: 'e8eaf6', rtlMode: true },
    }));
    if (bullets.length) {
      s.addText(bullets, { x: 0.3, y: 1.3, w: '95%', h: 4.5, align: 'right', lineSpacingMultiple: 1.6 });
    }

    // Footer
    s.addText('\u0645\u062f\u0627\u0631\u0643 \u0627\u0644\u062a\u0639\u0644\u064a\u0645\u064a\u0629', {
      x: 0, y: 6.8, w: '100%', h: 0.35, align: 'center',
      fontSize: 12, color: '888888', rtlMode: true,
    });
  }

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fileName = 'pptx_' + Date.now() + '.pptx';
  const filePath = path.join(UPLOAD_DIR, fileName);
  await pptx.writeFile({ fileName: filePath });

  return { fileName, filePath, url: '/uploads/' + fileName, slidesCount: (data.slides || []).length + 1 };
}

// ── DOCX Generator ─────────────────────────────────────────────
async function generateDOCX(topic) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');
  const data = await buildStructure(topic, 'docx');

  const children = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: data.title || topic, bold: true, size: 56, rightToLeft: true, color: '1a1a2e' })],
    alignment: AlignmentType.RIGHT, bidirectional: true,
    spacing: { after: 400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'e94560' } },
  }));

  for (const sec of (data.sections || [])) {
    // Section heading
    children.push(new Paragraph({
      children: [new TextRun({ text: sec.heading || '', bold: true, size: 36, rightToLeft: true, color: 'e94560' })],
      alignment: AlignmentType.RIGHT, bidirectional: true,
      spacing: { before: 240, after: 120 },
    }));

    for (const para of (sec.paragraphs || [])) {
      children.push(new Paragraph({
        children: [new TextRun({ text: para, size: 24, rightToLeft: true, color: '333333' })],
        alignment: AlignmentType.RIGHT, bidirectional: true,
        spacing: { after: 100 },
      }));
    }
  }

  // Footer paragraph
  children.push(new Paragraph({
    children: [new TextRun({ text: '\u0635\u062f\u0631 \u0639\u0646: \u0645\u062f\u0627\u0631\u0643 \u0627\u0644\u062a\u0639\u0644\u064a\u0645\u064a\u0629', italics: true, size: 18, color: '999999', rightToLeft: true })],
    alignment: AlignmentType.RIGHT, bidirectional: true,
    spacing: { before: 400 },
  }));

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      children,
    }],
  });

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fileName = 'doc_' + Date.now() + '.docx';
  const filePath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(filePath, await Packer.toBuffer(doc));

  return { fileName, filePath, url: '/uploads/' + fileName };
}

/**
 * Smart entry point — detect format from user input.
 * @param {string} topic    — user message / topic
 * @param {'pptx'|'docx'}   [format]
 */
async function generateDocument(topic, format) {
  format = (format || 'pptx').toLowerCase();
  if (format === 'docx' || format === 'word') return generateDOCX(topic);
  return generatePPTX(topic);
}

/**
 * Detect PPTX/DOCX generation commands in Arabic/English.
 * Returns { matched: true, format, topic } or { matched: false }.
 */
function detectDocCommand(input) {
  const pptxRx = /(?:\u0623\u0646\u0634\u0626|\u0627\u0635\u0646\u0639|\u0627\u0639\u0645\u0644|create|make)\s+(?:\u0639\u0631\u0636|\u0628\u0631\u064a\u0632\u0646\u062a\u064a\u0634\u0646|pptx|powerpoint|presentation)\s+(?:\u0639\u0646|about|on|for)\s+(.+)/iu;
  const docxRx  = /(?:\u0623\u0646\u0634\u0626|\u0627\u0635\u0646\u0639|\u0627\u0639\u0645\u0644|create|make)\s+(?:\u0645\u0633\u062a\u0646\u062f|\u0648\u062b\u064a\u0642\u0629|word|docx|document)\s+(?:\u0639\u0646|about|on|for)\s+(.+)/iu;

  let m = input.match(pptxRx);
  if (m) return { matched: true, format: 'pptx', topic: m[1].trim() };
  m = input.match(docxRx);
  if (m) return { matched: true, format: 'docx', topic: m[1].trim() };
  return { matched: false };
}

module.exports = { generatePPTX, generateDOCX, generateDocument, detectDocCommand };
