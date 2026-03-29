import React, { useState, useEffect } from 'react';
import { useChat } from '../../context/ChatContext';

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
}

/* ── Lightbox overlay ─────────────────────────────────── */
function LightboxOverlay({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="عرض الصورة">
      <img
        src={src}
        alt="صورة كاملة"
        className="lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
      <button className="lightbox-close" onClick={onClose} aria-label="إغلاق">✕</button>
    </div>
  );
}

/* ── Media sub-components with onError fallback ───────── */
function BubbleImage({ src }) {
  const [failed, setFailed]       = useState(false);
  const [lightbox, setLightbox]   = useState(false);
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="bubble-file-link">
        🖼 فتح الصورة
      </a>
    );
  }
  return (
    <>
      <img
        src={src}
        alt="صورة"
        className="bubble-image"
        loading="lazy"
        onError={() => setFailed(true)}
        onClick={() => setLightbox(true)}
      />
      {lightbox && <LightboxOverlay src={src} onClose={() => setLightbox(false)} />}
    </>
  );
}

function BubbleVideo({ src }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="bubble-file-link">
        🎬 تشغيل الفيديو
      </a>
    );
  }
  return (
    <video
      controls
      src={src}
      className="bubble-video"
      preload="metadata"
      onError={() => setFailed(true)}
    />
  );
}

function BubbleAudio({ src }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="bubble-file-link">
        🎵 تشغيل الصوت
      </a>
    );
  }
  return <audio controls src={src} className="bubble-audio" onError={() => setFailed(true)} />;
}

/* ── Main component ───────────────────────────────────── */
export default function MessageBubble({ message, isMine }) {
  const { sendReaction, activeRoomId } = useChat();
  const [showEmoji, setShowEmoji] = useState(false);

  const isAI      = !!message.agentId;
  const reactions = message.reactions || [];
  const mediaSrc  = message.media_url || message.body;

  return (
    <div className={`bubble-row ${isMine ? 'mine' : 'theirs'} ${isAI ? 'ai-row' : ''}`}>
      {/* Avatar */}
      {!isMine && (
        <div className="bubble-avatar" title={message.sender}>
          {isAI ? (message.agentAvatar || '🤖') : (message.sender?.[0] || '?')}
        </div>
      )}

      <div className="bubble-group">
        {/* Sender name */}
        {!isMine && (
          <span className={`bubble-sender ${isAI ? 'ai-sender' : ''}`}>
            {message.sender}
            {isAI && <span className="ai-badge">AI</span>}
          </span>
        )}

        {/* Message body */}
        <div
          className={`bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'} ${isAI ? 'bubble-ai' : ''}${message.pending ? ' bubble-pending' : ''}`}
          onDoubleClick={() => setShowEmoji(v => !v)}
        >
          {/* Reply preview */}
          {message.replyTo && (
            <div className="reply-preview">↩ رد على رسالة</div>
          )}

          {/* Content */}
          {message.media_missing && message.media_url ? (
            <p className="bubble-media-missing">
              ⚠ هذا الملف غير متوفر على الخادم (قد يكون حُذف أو نُقل).
            </p>
          ) : message.type === 'image' ? (
            <BubbleImage src={mediaSrc} />
          ) : message.type === 'audio' ? (
            <BubbleAudio src={mediaSrc} />
          ) : message.type === 'video' ? (
            <BubbleVideo src={mediaSrc} />
          ) : message.type === 'file' ? (
            <a
              href={mediaSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="bubble-file-link"
              download
            >
              📄 {message.body?.split('/').pop() || 'ملف'}
            </a>
          ) : (
            <p className="bubble-text">{message.body}</p>
          )}

          <span className="bubble-ts">
            {isMine && !message.pending && <span className="bubble-check read">✓✓</span>}
            {formatTime(message.ts)}
            {message.pending && <span className="sending-indicator"> ⏳</span>}
          </span>
        </div>

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map(r => (
              <button
                key={r.emoji}
                className="reaction-badge"
                onClick={() => sendReaction(message.id, activeRoomId, r.emoji)}
                title={`${r.count} تفاعل`}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}

        {/* Emoji picker (double-click) */}
        {showEmoji && (
          <div className="emoji-picker">
            {COMMON_EMOJIS.map(e => (
              <button
                key={e}
                className="emoji-btn"
                onClick={() => { sendReaction(message.id, activeRoomId, e); setShowEmoji(false); }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

