import React, { useState, useRef, useCallback } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { api }     from '../../services/api';

const MAX_BYTES = 50 * 1024 * 1024;

function mimeToType(mimeStr) {
  if (!mimeStr) return 'file';
  if (mimeStr.startsWith('image/'))  return 'image';
  if (mimeStr.startsWith('audio/'))  return 'audio';
  if (mimeStr.startsWith('video/'))  return 'video';
  if (mimeStr === 'application/pdf') return 'file';
  return 'file';
}

function formatBytes(n) {
  if (n < 1024)    return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1048576).toFixed(1)} MB`;
}

function formatRecordTime(s) {
  return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
}

/* ── SVG icons matching WhatsApp ── */
const IconEmoji = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M9.153 11.603c.795 0 1.44-.88 1.44-1.962s-.645-1.96-1.44-1.96c-.795 0-1.44.88-1.44 1.96s.645 1.962 1.44 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.333 6.066-5.551 6.066-5.551-6.078 1.782-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-4.382 0-5.051-1.959-5.051-1.959 4.717 1.19 10.102 0 10.102 0zm1.011-2.469c0 1.082-.645 1.962-1.44 1.962s-1.44-.88-1.44-1.962.645-1.96 1.44-1.96.644.878 1.44 1.96zM12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1zm0 20.5C6.753 21.5 2.5 17.247 2.5 12S6.753 2.5 12 2.5 21.5 6.753 21.5 12 17.247 21.5 12 21.5z"/>
  </svg>
);
const IconAttach = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 7.329c-.182-.182-.667-.394-1.039-.022l-7.208 7.21A5.556 5.556 0 0 0 1.816 15.556z"/>
  </svg>
);
const IconCamera = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.497 0-1.966-1.53-3.497-3.531-3.497-2.001 0-3.531 1.531-3.531 3.497 0 1.967 1.53 3.497 3.531 3.497z"/>
    <path d="M20 4h-3.197L15 2H9L7.197 4H4c-1.103 0-2 .897-2 2v12c0 1.103.897 2 2 2h16c1.103 0 2-.897 2-2V6c0-1.103-.897-2-2-2zm-8 13c-2.757 0-5-2.243-5-5s2.243-5 5-5 5 2.243 5 5-2.243 5-5 5z"/>
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V21h2v-2.28c3.28-.49 6-3.3 6-6.72h-1.7z"/>
  </svg>
);
const IconSend = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"/>
  </svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z"/>
  </svg>
);

export default function MessageInput({ roomId }) {
  const { sendMessage, sendTyping } = useChat();
  const { token }  = useAuth();
  const [text, setText]               = useState('');
  const [showEmoji, setShowEmoji]     = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setProgress] = useState(0);
  const [dragOver, setDragOver]       = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [recording, setRecording]     = useState(false);
  const [recordTime, setRecordTime]   = useState(0);

  const fileRef      = useRef(null);
  const cameraRef    = useRef(null);
  const xhrRef       = useRef(null);
  const typingTimer  = useRef(null);
  const recorderRef  = useRef(null);
  const recTimerRef  = useRef(null);
  const chunksRef    = useRef([]);
  const textareaRef  = useRef(null);

  const uploadAndSend = useCallback(async (file, captionText = '') => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setUploadError(`الملف كبير جداً (${formatBytes(file.size)}). الحد 50 MB`);
      return;
    }
    setUploadError(null);
    setPendingFile({ name: file.name, size: file.size });
    setUploading(true);
    setProgress(0);
    try {
      const res = await api.uploadFile(
        file, token,
        (pct) => setProgress(pct),
        (xhr) => { xhrRef.current = xhr; }
      );
      if (res.ok) {
        const type = mimeToType(res.mime || file.type);
        sendMessage(roomId, captionText || res.url, type, null, res.url, res.mime || file.type);
      } else {
        setUploadError(res.error || 'فشل رفع الملف');
      }
    } catch (err) {
      if (err?.message !== 'Upload cancelled') setUploadError('فشل الاتصال بالخادم');
    } finally {
      setUploading(false);
      setProgress(0);
      setPendingFile(null);
      xhrRef.current = null;
    }
  }, [roomId, token, sendMessage]);

  const handleSend = useCallback(() => {
    if (pendingImage) {
      const { file } = pendingImage;
      const caption  = text.trim();
      URL.revokeObjectURL(pendingImage.previewUrl);
      setPendingImage(null);
      setText('');
      setShowEmoji(false);
      uploadAndSend(file, caption);
      return;
    }
    if (!text.trim()) return;
    sendMessage(roomId, text.trim());
    setText('');
    setShowEmoji(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, pendingImage, roomId, sendMessage, uploadAndSend]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleType = useCallback((e) => {
    const el = e.target;
    setText(el.value);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(roomId), 300);
  }, [roomId, sendTyping]);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
    } else {
      await uploadAndSend(file);
    }
  }, [uploadAndSend]);

  const handleCameraChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }, []);

  const removePendingImage = useCallback(() => {
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }, [pendingImage]);

  const cancelUpload = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setUploading(false);
    setProgress(0);
    setPendingFile(null);
  }, []);

  const handleDragOver  = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  }, []);
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
    } else {
      await uploadAndSend(file);
    }
  }, [uploadAndSend]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size > 0) {
          const ext  = recorder.mimeType.includes('webm') ? 'webm' : 'm4a';
          const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: recorder.mimeType });
          await uploadAndSend(file);
        }
        setRecording(false);
        setRecordTime(0);
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      setRecordTime(0);
      recTimerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch {
      setUploadError('لا يمكن الوصول للميكروفون. تحقق من الأذونات.');
    }
  }, [uploadAndSend]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const cancelRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = () => { recorderRef.current.stream?.getTracks().forEach(t => t.stop()); };
      recorderRef.current.stop();
    }
    clearInterval(recTimerRef.current);
    chunksRef.current = [];
    setRecording(false);
    setRecordTime(0);
  }, []);

  const EMOJI_LIST = ['😀','😂','❤️','👍','🔥','😢','😮','🎉','🙏','💡','👋','🤔','😊','🙌','💪'];
  const hasContent = text.trim() || pendingImage;

  return (
    <div
      className={`wa-input-wrap${dragOver ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Error banner */}
      {uploadError && (
        <div className="wa-upload-error" role="alert">
          <span>⚠️ {uploadError}</span>
          <button onClick={() => setUploadError(null)} aria-label="إغلاق">✕</button>
        </div>
      )}

      {/* Image preview before send */}
      {pendingImage && (
        <div className="wa-img-preview">
          <img src={pendingImage.previewUrl} alt="معاينة" className="wa-img-preview-thumb" />
          <span className="wa-img-preview-name">{pendingImage.file.name}</span>
          <button className="wa-img-preview-close" onClick={removePendingImage} aria-label="إلغاء">✕</button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="wa-upload-progress">
          <span className="wa-upload-name">{pendingFile?.name} ({formatBytes(pendingFile?.size || 0)})</span>
          <button className="wa-upload-cancel" onClick={cancelUpload}>✕</button>
          <div className="wa-upload-bar"><div className="wa-upload-fill" style={{ width:`${uploadProgress}%` }} /></div>
          <span className="wa-upload-pct">{uploadProgress}%</span>
        </div>
      )}

      {/* Emoji tray */}
      {showEmoji && (
        <div className="wa-emoji-tray">
          {EMOJI_LIST.map(e => (
            <button key={e} className="wa-emoji-btn" onClick={() => { setText(t => t + e); setShowEmoji(false); textareaRef.current?.focus(); }}>
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Main row */}
      <div className="wa-input-row">
        {recording ? (
          <>
            <button className="wa-rec-cancel" onClick={cancelRecording} title="إلغاء">
              <IconTrash />
            </button>
            <div className="wa-rec-indicator">
              <span className="wa-rec-dot" />
              <span className="wa-rec-time">{formatRecordTime(recordTime)}</span>
              <span className="wa-rec-label">جارٍ التسجيل...</span>
            </div>
            <button className="wa-btn-send" onClick={stopRecording} title="إرسال">
              <IconSend />
            </button>
          </>
        ) : (
          <>
            {/* Emoji — right side (RTL: appears visually on right) */}
            <button className="wa-input-icon" onClick={() => setShowEmoji(v => !v)} title="إيموجي">
              <IconEmoji />
            </button>

            {/* Text field */}
            <textarea
              ref={textareaRef}
              className="wa-textarea"
              placeholder="اكتب رسالة..."
              value={text}
              onChange={handleType}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={4000}
              dir="auto"
            />

            {/* Attach + Camera only when no text (like WhatsApp) */}
            {!hasContent && (
              <>
                <button className="wa-input-icon" onClick={() => fileRef.current?.click()} disabled={uploading} title="إرفاق ملف">
                  <IconAttach />
                </button>
                <button className="wa-input-icon" onClick={() => cameraRef.current?.click()} disabled={uploading} title="صورة">
                  <IconCamera />
                </button>
              </>
            )}

            <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,application/pdf" style={{display:'none'}} onChange={handleFileChange} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={handleCameraChange} />

            {/* Mic ↔ Send (far left in RTL) */}
            {hasContent ? (
              <button className="wa-btn-send" onClick={handleSend} title="إرسال">
                <IconSend />
              </button>
            ) : (
              <button className="wa-btn-send wa-btn-mic" onClick={startRecording} disabled={uploading} title="تسجيل صوتي">
                <IconMic />
              </button>
            )}
          </>
        )}
      </div>

      {dragOver && <div className="wa-drop-hint">↓ أفلت الملف هنا</div>}
    </div>
  );
}

