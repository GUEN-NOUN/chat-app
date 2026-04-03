'use strict';
require('dotenv').config();

// ══════════════════════════════════════════
//   tools/generators.js
//   إنشاء الملفات: PPTX, DOCX, XLSX
// ══════════════════════════════════════════

const path = require('path');
const fs   = require('fs');

// ── إنشاء PowerPoint ──────────────────────
async function generatePPTX(slides, outputPath) {
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.author    = 'AI Workflow Agent';
  pptx.company   = 'AI Agent';
  pptx.subject   = slides[0]?.title || 'عرض تقديمي';
  pptx.title     = slides[0]?.title || 'عرض تقديمي';

  for (const slide of slides) {
    const s = pptx.addSlide();
    s.background = { color: '1a1a2e' };

    // العنوان
    s.addText(slide.title || '', {
      x: 0.5, y: 0.3, w: 9, h: 1.2,
      fontSize: 32, bold: true, color: 'ffffff',
      align: 'center', fontFace: 'Arial'
    });

    // الخط الفاصل
    s.addShape(pptx.ShapeType.rect, {
      x: 1, y: 1.6, w: 8, h: 0.04,
      fill: { color: '4f8ef7' }, line: { color: '4f8ef7' }
    });

    // المحتوى
    if (slide.content) {
      s.addText(slide.content, {
        x: 0.5, y: 1.8, w: 9, h: 4.5,
        fontSize: 18, color: 'e0e0e0',
        align: 'right', valign: 'top',
        fontFace: 'Arial', wrap: true
      });
    }

    // النقاط
    if (slide.bullets && slide.bullets.length) {
      const bulletText = slide.bullets.map(b => ({ text: `• ${b}`, options: { breakLine: true } }));
      s.addText(bulletText, {
        x: 0.5, y: 1.8, w: 9, h: 4.5,
        fontSize: 16, color: 'ccddff',
        align: 'right', valign: 'top',
        fontFace: 'Arial'
      });
    }

    // رقم الشريحة
    s.addText(`${slides.indexOf(slide) + 1} / ${slides.length}`, {
      x: 8.5, y: 6.8, w: 1, h: 0.3,
      fontSize: 10, color: '888888', align: 'right'
    });
  }

  await pptx.writeFile({ fileName: outputPath });
  return outputPath;
}

// ── إنشاء Word DOCX ───────────────────────
async function generateDOCX(content, outputPath) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

  const paragraphs = [];
  const lines = content.split('\n').filter(l => l.trim());

  for (const line of lines) {
    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(2),
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.RIGHT
      }));
    } else if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(3),
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.RIGHT
      }));
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(2),
        bullet: { level: 0 },
        alignment: AlignmentType.RIGHT
      }));
    } else {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: line, size: 24 })],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 100 }
      }));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// ── إنشاء Excel XLSX ──────────────────────
async function generateXLSX(data, outputPath, sheetName = 'البيانات') {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  let ws;

  if (Array.isArray(data) && data.length > 0) {
    ws = XLSX.utils.json_to_sheet(data);
  } else if (typeof data === 'string') {
    // تحويل نص مجدول إلى شيت
    const rows = data.trim().split('\n').map(r => r.split(/[,\t|]+/).map(c => c.trim()));
    ws = XLSX.utils.aoa_to_sheet(rows);
  } else {
    ws = XLSX.utils.json_to_sheet([data]);
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, outputPath);
  return outputPath;
}

module.exports = { generatePPTX, generateDOCX, generateXLSX };
