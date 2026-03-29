'use strict';

/** Safe for textContent only — strips any HTML/script; max length to avoid abuse */
function sanitizeText(s, maxLen) {
  if (s == null) return '';
  var t = String(s)
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/[\0-\x1f\x7f]/g, '')
    .trim();
  if (maxLen != null && t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}

/** Validate data URL for display (prevent javascript: etc.) */
function isAllowedDataUrl(url, kind) {
  if (!url || typeof url !== 'string') return false;
  if (url.slice(0, 5) !== 'data:') return false;
  if (kind === 'image') return /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(url);
  // Allow codec params in MIME type e.g. audio/webm;codecs=opus;base64,…
  if (kind === 'audio') return /^data:audio\/(mpeg|mp3|ogg|wav|webm|x-wav)(;[^,]*)?;base64,/i.test(url);
  return false;
}

window.Utils = {
  now: function () {
    return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  },
  esc: function (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  sanitizeText: sanitizeText,
  isAllowedDataUrl: isAllowedDataUrl
};
