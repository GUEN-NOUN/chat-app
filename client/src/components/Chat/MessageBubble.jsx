import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '../../context/ChatContext';

const COMMON_EMOJIS = ['ðŸ‘', 'â¤ï¸', 'ðŸ˜‚', 'ðŸ˜®', 'ðŸ˜¢', 'ðŸ”¥'];

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
}

/* â”€â”€ Safe HTML escape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* â”€â”€ Markdown renderer for AI messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function renderAiMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeLines = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Code block open/close
    if (raw.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        if (inList) { result.push('</ul>'); inList = false; }
        result.push(`<pre class="md-pre"><code>${codeLines.join('\n')}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) { codeLines.push(escHtml(raw)); continue; }

    let l = escHtml(raw);

    // Bold/italic/inline-code (applied before block rules)
    l = l.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    l = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    l = l.replace(/\*(.+?)\*/g, '<em>$1</em>');
    l = l.replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>');

    // Horizontal rule
    if (/^---+$/.test(l.trim())) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push('<hr class="md-hr">');
      continue;
    }
    // Headers
    if (l.startsWith('### ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h4 class="md-h4">${l.slice(4)}</h4>`);
      continue;
    }
    if (l.startsWith('## ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h3 class="md-h3">${l.slice(3)}</h3>`);
      continue;
    }
    if (l.startsWith('# ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h2 class="md-h2">${l.slice(2)}</h2>`);
      continue;
    }
    // Blockquote
    if (l.startsWith('&gt; ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<blockquote class="md-blockquote">${l.slice(5)}</blockquote>`);
      continue;
    }
    // Bullet list
    if (/^[\*\-â€¢] /.test(l)) {
      if (!inList) { result.push('<ul class="md-ul">'); inList = true; }
      result.push(`<li>${l.replace(/^[\*\-â€¢] /, '')}</li>`);
      continue;
    }
    // Numbered list
    if (/^\d+\. /.test(l)) {
      if (!inList) { result.push('<ul class="md-ul md-ol">'); inList = true; }
      result.push(`<li>${l.replace(/^\d+\. /, '')}</li>`);
      continue;
    }
    // Empty line â†’ paragraph break
    if (!l.trim()) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push('<br>');
      continue;
    }
    // Normal line
    if (inList) result.push('</ul>');
    inList = false;
    result.push(`<span>${l}</span><br>`);
  }

  if (inCodeBlock) result.push(`<pre class="md-pre"><code>${codeLines.join('\n')}</code></pre>`);
  if (inList) result.push('</ul>');

  // Clean up repeated <br> at end
  return result.join('').replace(/(<br>){3,}/g, '<br><br>').replace(/<br>$/, '');
}

/* â”€â”€ AI Thinking dots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function AiThinkingDots() {
  return (
    <div className="ai-thinking-dots" aria-label="Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ ÙŠÙÙƒØ±">
      <span /><span /><span />
    </div>
  );
}

/* â”€â”€ Lightbox overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function LightboxOverlay({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Ø¹Ø±Ø¶ Ø§Ù„ØµÙˆØ±Ø©">
      <img
        src={src}
        alt="ØµÙˆØ±Ø© ÙƒØ§Ù…Ù„Ø©"
        className="lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
      <button className="lightbox-close" onClick={onClose} aria-label="Ø¥ØºÙ„Ø§Ù‚">âœ•</button>
    </div>
  );
}

/* â”€â”€ Media sub-components with onError fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function BubbleImage({ src }) {
  const [failed, setFailed]       = useState(false);
  const [lightbox, setLightbox]   = useState(false);
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="bubble-file-link">
        ðŸ–¼ ÙØªØ­ Ø§Ù„ØµÙˆØ±Ø©
      </a>
    );
  }
  return (
    <>
      <img
        src={src}
        alt="ØµÙˆØ±Ø©"
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
        ðŸŽ¬ ØªØ´ØºÙŠÙ„ Ø§Ù„ÙÙŠØ¯ÙŠÙˆ
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
        ðŸŽµ ØªØ´ØºÙŠÙ„ Ø§Ù„ØµÙˆØª
      </a>
    );
  }
  return <audio controls src={src} className="bubble-audio" onError={() => setFailed(true)} />;
}

/* â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function MessageBubble({ message, isMine }) {
  const { sendReaction, activeRoomId } = useChat();
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const longPressRef = useRef(null);
  const menuRef = useRef(null);

  const isAI      = !!message.agentId;
  const isSystem  = message.senderId === '__system__';
  const reactions = message.reactions || [];
  const mediaSrc  = message.media_url || message.body;

  // Long press detection for context menu
  const handleTouchStart = useCallback(() => {
    longPressRef.current = setTimeout(() => setShowMenu(true), 500);
  }, []);
  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressRef.current);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showMenu]);

  const handleCopy = () => {
    if (message.body) navigator.clipboard?.writeText(message.body);
    setShowMenu(false);
  };

  // System messages: centered label
  if (isSystem) {
    return (
      <div className="system-message">
        <span>{message.body}</span>
      </div>
    );
  }

  return (
    <div className={`bubble-row ${isMine ? 'mine' : 'theirs'} ${isAI ? 'ai-row' : ''}`}>
      {/* Avatar â€” shown for AI and others in group */}
      {!isMine && (
        <div className={`bubble-avatar ${isAI ? 'bubble-avatar-ai' : ''}`} title={message.sender}>
          {isAI
            ? (message.agentAvatar || 'ðŸ¤–')
            : (message.sender?.[0]?.toUpperCase() || '?')}
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
          onDoubleClick={() => !isAI && setShowEmoji(v => !v)}
          onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
        >
          {/* Reply preview */}
          {message.replyTo && (
            <div className="reply-preview">â†© Ø±Ø¯ Ø¹Ù„Ù‰ Ø±Ø³Ø§Ù„Ø©</div>
          )}

          {/* Content */}
          {message.thinking ? (
            <AiThinkingDots />
          ) : message.media_missing && message.media_url ? (
            <p className="bubble-media-missing">
              âš  Ù‡Ø°Ø§ Ø§Ù„Ù…Ù„Ù ØºÙŠØ± Ù…ØªÙˆÙØ± Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø§Ø¯Ù… (Ù‚Ø¯ ÙŠÙƒÙˆÙ† Ø­ÙØ°Ù Ø£Ùˆ Ù†ÙÙ‚Ù„).
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
              ðŸ“„ {message.body?.split('/').pop() || 'Ù…Ù„Ù'}
            </a>
          ) : isAI && message.body ? (
            <div
              className="bubble-text ai-markdown"
              dangerouslySetInnerHTML={{ __html: renderAiMarkdown(message.body) }}
            />
          ) : (
            <p className="bubble-text">{message.body}</p>
          )}

          {!message.thinking && (
            <span className="bubble-ts">
              {isMine && !message.pending && <span className="bubble-check read">âœ“âœ“</span>}
              {isMine && message.pending && <span className="bubble-check">âœ“</span>}
              {formatTime(message.ts)}
              {message.streaming && !message.thinking && <span className="streaming-cursor">â–‹</span>}
            </span>
          )}
        </div>

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map(r => (
              <button
                key={r.emoji}
                className="reaction-badge"
                onClick={() => sendReaction(message.id, activeRoomId, r.emoji)}
                title={`${r.count} ØªÙØ§Ø¹Ù„`}
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

        {/* Context menu (long-press / right-click) */}
        {showMenu && (
          <div className="bubble-context-menu" ref={menuRef}>
            <button className="context-menu-item" onClick={handleCopy}>ðŸ“‹ Ù†Ø³Ø®</button>
            {!isAI && (
              <button className="context-menu-item" onClick={() => { setShowEmoji(true); setShowMenu(false); }}>ðŸ˜Š ØªÙØ§Ø¹Ù„</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
