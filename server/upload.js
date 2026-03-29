'use strict';

/**
 * server/upload.js — Secure file upload endpoint
 *
 * POST /api/upload
 *   - Requires auth: admin cookie OR chat JWT (Bearer)
 *   - Validates MIME type via magic-bytes (file-type), not just headers
 *   - Enforces per-type size limits
 *   - Stores files under /uploads/<uuid>.<ext>
 *   - Returns { ok, url, mime, size, id }
 *
 * For production, replace disk storage with S3/GCS:
 *   - Use multer-s3 or stream directly to storage SDK
 *   - Never serve uploads/ via Express in production
 */

const path       = require('path');
const fs         = require('fs');
const express    = require('express');
const multer     = require('multer');
const { v4: uuidv4 } = require('uuid');
const rateLimit  = require('express-rate-limit');
const jwt        = require('jsonwebtoken');
const { JWT_SECRET, COOKIE_NAME } = require('./auth');

const router = express.Router();

/* ── Upload directory ── */
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ALLOWED = {
  'image/jpeg': { ext: '.jpg',  maxBytes: 5  * 1024 * 1024 },
  'image/png':  { ext: '.png',  maxBytes: 5  * 1024 * 1024 },
  'image/webp': { ext: '.webp', maxBytes: 5  * 1024 * 1024 },
  'image/gif':  { ext: '.gif',  maxBytes: 5  * 1024 * 1024 },
  'application/pdf': { ext: '.pdf', maxBytes: 20 * 1024 * 1024 },
  'audio/mpeg': { ext: '.mp3',  maxBytes: 10 * 1024 * 1024 },
  'audio/webm': { ext: '.webm', maxBytes: 10 * 1024 * 1024 },
  'audio/ogg':  { ext: '.ogg',  maxBytes: 10 * 1024 * 1024 },
  'audio/mp4':  { ext: '.m4a',  maxBytes: 10 * 1024 * 1024 },
  'video/mp4':  { ext: '.mp4',  maxBytes: 50 * 1024 * 1024 },
  'video/webm': { ext: '.webm', maxBytes: 50 * 1024 * 1024 },
};

/* Magic-byte signatures for each allowed MIME */
const MAGIC = [
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', check: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  // PNG:  89 50 4E 47
  { mime: 'image/png',  check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  // GIF: 47 49 46 38
  { mime: 'image/gif',  check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  { mime: 'image/webp', check: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                                       b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  // PDF:  25 50 44 46 ('%PDF')
  { mime: 'application/pdf', check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  // MP3 with ID3: 49 44 33 OR MP3 sync: FF FB / FF F3 / FF F2
  { mime: 'audio/mpeg', check: (b) =>
    (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
    (b[0] === 0xFF && (b[1] === 0xFB || b[1] === 0xF3 || b[1] === 0xF2)) },
  // WebM / Matroska: 1A 45 DF A3
  { mime: 'video/webm', check: (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3 },
  // OGG: 4F 67 67 53 ('OggS')
  { mime: 'audio/ogg', check: (b) => b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53 },
  // MP4/M4A: ftyp box at offset 4
  { mime: 'video/mp4',  check: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
];

/**
 * Detect MIME from raw buffer magic bytes.
 * Returns matched MIME string or null.
 */
function detectMime(buffer) {
  for (const { mime, check } of MAGIC) {
    try {
      if (check(buffer)) {
        // WebM container: trust Content-Type for audio/webm vs video/webm
        if (mime === 'video/webm') return 'video/webm'; // caller handles audio/webm remapping
        // MP4 container: could be audio/mp4 (m4a)
        if (mime === 'video/mp4') return 'video/mp4'; // caller handles audio/mp4 remapping
        return mime;
      }
    } catch { /* buffer too short — skip */ }
  }
  return null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AUTH MIDDLEWARE (admin cookie OR chat JWT Bearer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function requireUploadAuth(req, res, next) {
  // 1. Try admin HTTP-only cookie first
  const cookie = req.cookies && req.cookies[COOKIE_NAME];
  if (cookie) {
    try {
      req.uploader = { ...jwt.verify(cookie, JWT_SECRET), authType: 'admin' };
      return next();
    } catch { /* invalid cookie — fall through to Bearer */ }
  }

  // 2. Try Authorization: Bearer <chat JWT>
  const authHeader = req.headers['authorization'] || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (bearer) {
    try {
      const decoded = jwt.verify(bearer, JWT_SECRET);
      // Chat tokens contain userId; admin tokens contain role — accept chat tokens only
      if (!decoded.userId) {
        return res.status(401).json({ ok: false, error: 'رمز المصادقة غير صالح' });
      }
      req.uploader = { ...decoded, authType: 'chat' };
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'رمز المصادقة منتهي الصلاحية أو غير صالح' });
    }
  }

  return res.status(401).json({ ok: false, error: 'المصادقة مطلوبة' });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MULTER — memory storage (validate BEFORE writing to disk)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ABSOLUTE_MAX = 50 * 1024 * 1024; // hard ceiling for multer (50 MB)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ABSOLUTE_MAX, files: 1 },
  fileFilter(_req, file, cb) {
    // Reject obviously disallowed content-types before buffering
    if (!ALLOWED[file.mimetype]) {
      return cb(Object.assign(new Error('نوع الملف غير مدعوم'), { code: 'INVALID_MIME' }));
    }
    cb(null, true);
  },
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   RATE LIMITER — 10 uploads / minute / IP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'تجاوزت الحد المسموح به. حاول بعد دقيقة.' },
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/upload
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

router.post(
  '/',
  uploadLimiter,
  requireUploadAuth,
  (req, res, next) => upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, error: 'حجم الملف يتجاوز الحد المسموح به' });
    }
    if (err.code === 'INVALID_MIME') {
      return res.status(415).json({ ok: false, error: err.message });
    }
    return res.status(400).json({ ok: false, error: err.message || 'خطأ في رفع الملف' });
  }),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'لم يتم إرسال أي ملف' });
    }

    const { buffer, mimetype, size } = req.file;

    /* ── 1. Magic-bytes validation (do NOT trust Content-Type) ── */
    const realMime = detectMime(buffer);
    if (!realMime) {
      return res.status(415).json({ ok: false, error: 'محتوى الملف غير معروف أو غير مدعوم' });
    }

    // Allow audio variants of container formats (webm/mp4 can be audio-only)
    let effectiveMime = realMime;
    if (realMime === 'video/webm' && mimetype === 'audio/webm') effectiveMime = 'audio/webm';
    if (realMime === 'video/mp4'  && mimetype === 'audio/mp4')  effectiveMime = 'audio/mp4';

    if (!ALLOWED[effectiveMime]) {
      return res.status(415).json({
        ok: false,
        error: `نوع الملف ${effectiveMime} غير مدعوم`,
      });
    }

    /* ── 2. Per-type size limit ── */
    const config = ALLOWED[effectiveMime];
    if (size > config.maxBytes) {
      const limitMB = config.maxBytes / (1024 * 1024);
      return res.status(413).json({
        ok: false,
        error: `الحد الأقصى لهذا النوع ${limitMB} ميجابايت`,
      });
    }

    /* ── 3. Write to disk ── */
    const id       = uuidv4();
    const filename = `${id}${config.ext}`;
    const destPath = path.join(UPLOAD_DIR, filename);

    try {
      await fs.promises.writeFile(destPath, buffer);
    } catch (writeErr) {
      console.error('[upload] write error:', writeErr);
      return res.status(500).json({ ok: false, error: 'فشل حفظ الملف' });
    }

    /* ── 4. Optional image thumbnail (if sharp is installed) ── */
    let thumbnailUrl = undefined;
    if (effectiveMime.startsWith('image/')) {
      try {
        const sharp = require('sharp');
        const thumbName = `${id}_thumb.webp`;
        const thumbPath = path.join(UPLOAD_DIR, thumbName);
        await sharp(buffer).resize(320, 320, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(thumbPath);
        thumbnailUrl = `/uploads/${thumbName}`;
      } catch { /* sharp not installed — skip silently */ }
    }

    /* ── 5. Logging ── */
    const uploader     = req.uploader;
    const uploaderId   = uploader.id || uploader.sub || 'unknown';
    const uploaderType = uploader.authType;
    const ip           = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    console.log(`[upload] id=${id} mime=${effectiveMime} size=${size} uploader=${uploaderId}(${uploaderType}) ip=${ip} ts=${new Date().toISOString()}`);

    /* ── 6. Respond ── */
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(201).json({
      ok: true,
      url: `/uploads/${filename}`,
      mime: effectiveMime,
      size,
      id,
      ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
    });
  }
);

module.exports = { router };
