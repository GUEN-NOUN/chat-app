'use strict';

// ══════════════════════════════════════════
//   tools/file-analyzer.js
//   تحليل أي ملف: PDF, DOCX, XLSX, صور
// ══════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

// قراءة نص من PDF
async function extractPDF(filePath) {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc  = await pdfjsLib.getDocument({ data }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text.trim() || 'لا يوجد نص في هذا الملف';
  } catch {
    return null;
  }
}

// قراءة نص من DOCX
async function extractDOCX(filePath) {
  const mammoth = require('mammoth');
  const result  = await mammoth.extractRawText({ path: filePath });
  return result.value || 'ملف فارغ';
}

// قراءة بيانات من XLSX
async function extractXLSX(filePath) {
  const XLSX = require('xlsx');
  const wb   = XLSX.readFile(filePath);
  let output = '';
  for (const name of wb.SheetNames.slice(0, 3)) {
    const data = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    output += `=== ورقة: ${name} ===\n${data.slice(0, 3000)}\n\n`;
  }
  return output || 'ملف فارغ';
}

// قراءة صورة كـ base64
function readImageBase64(filePath) {
  const buffer   = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

// قراءة أي ملف نصي
function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').slice(0, 8000);
}

// الدالة الرئيسية: اكتشاف النوع تلقائياً
async function analyzeFile(filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  let text   = null;
  let type   = 'text';

  switch (ext) {
    case '.pdf':
      text = await extractPDF(filePath);
      type = 'pdf';
      break;
    case '.docx':
    case '.doc':
      text = await extractDOCX(filePath);
      type = 'document';
      break;
    case '.xlsx':
    case '.xls':
    case '.csv':
      text = await extractXLSX(filePath);
      type = 'spreadsheet';
      break;
    case '.jpg': case '.jpeg': case '.png':
    case '.gif': case '.webp': case '.bmp':
      return { type: 'image', base64: readImageBase64(filePath), name };
    case '.txt': case '.md': case '.json':
    case '.js':  case '.py':  case '.html':
      text = readTextFile(filePath);
      type = 'code';
      break;
    default:
      try { text = readTextFile(filePath); type = 'text'; }
      catch { text = 'صيغة الملف غير مدعومة'; }
  }

  return { type, text: text || 'لا يوجد محتوى', name };
}

module.exports = { analyzeFile, extractPDF, extractDOCX, extractXLSX, readImageBase64 };
