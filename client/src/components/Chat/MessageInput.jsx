import React, { useState, useRef, useCallback } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { api }     from '../../services/api';

const EMOJI_LIST  = ['😀','😂','❤️','👍','🔥','😢','😮','🎉','🙏','💡'];
const MAX_BYTES   = 50 * 1024 * 1024; // mirrors server hard ceiling

function mimeToType(mimeStr) {
  if (!mimeStr) return 'file';
  if (mimeStr.startsWith('image/'))  return 'image';
  if (mimeStr.startsWith('audio/'))  return 'audio';
  if (mimeStr.startsWith('video/'))  return 'video';
  if (mimeStr === 'application/pdf') return 'file';
  return 'file';
}

function formatBytes(n) {
  if (n < 1024)         return `${n} B`;
  if (n < 1024 * 1024)  return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageInput({ roomId }) {
  const { sendMessage, sendTyping, activeAgentId, agents } = useChat();
  const { token }  = useAuth();
  const [text, setText]               = useState('');
  const [showEmoji, setShowEmoji]     = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setProgress] = useState(0);
  const [dragOver, setDragOver]       = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [pendingFile, setPendingFile] = useState(null); // { name, size }
  const [recording, setRecording]     = useState(false);
  const [recordTime, setRecordTime]   = useState(0);
  const fileRef      = useRef(null);
  const cameraRef    = useRef(null);
  const xhrRef       = useRef(null);  // held for cancel
  const typingTimer  = useRef(null);
  const recorderRef  = useRef(null);
  const recTimerRef  = useRef(null);
  const chunksRef    = useRef([]);

  const activeAgent = agents.find(a => a.id === activeAgentId);

  const handleType = useCallback((e) => {
    setText(e.target.value);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(roomId), 300);
  }, [roomId, sendTyping]);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    sendMessage(roomId, text.trim());
    setText('');
    setShowEmoji(false);
  }, [text, roomId, sendMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const cancelUpload = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setUploading(false);
    setProgress(0);
    setPendingFile(null);
    setDragOver(false);
  }, []);

  const uploadAndSend = useCallback(async (file) => {
    if (!file) return;

    // Client-side guard — reject before hitting the network
    if (file.size > MAX_BYTES) {
      setUploadError(`الملف كبير جدًا (${formatBytes(file.size)}). الحد الأقصى 50 MB`);
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
        // Prefer server-generated thumbnail for images when available
        const displayUrl = (type === 'image' && res.thumbnail_url) ? res.thumbnail_url : res.url;
        sendMessage(roomId, res.url, type, null, res.url, res.mime || file.type);
      } else {
        setUploadError(res.error || 'فشل رفع الملف');
      }
    } catch (err) {
      if (err?.message !== 'Upload cancelled') {
        setUploadError('فشل الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة.');
      }
    } finally {
      setUploading(false);
      setProgress(0);
      setPendingFile(null);
      xhrRef.current = null;
    }
  }, [roomId, token, sendMessage]);

  const handleFileChange = useCallback(async (e) => {
    await uploadAndSend(e.target.files?.[0]);
    e.target.value = '';
  }, [uploadAndSend]);

  // Fix: only clear dragOver when leaving the container entirely, not when moving
  // into a child element (which would also trigger onDragLeave on the parent).
  const handleDragOver  = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  }, []);
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    await uploadAndSend(e.dataTransfer.files?.[0]);
  }, [uploadAndSend]);

  // Camera: open file picker in capture mode
  const handleCamera = useCallback(() => {
    cameraRef.current?.click();
  }, []);

  const handleCameraChange = useCallback(async (e) => {
    await uploadAndSend(e.target.files?.[0]);
    e.target.value = '';
  }, [uploadAndSend]);

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size > 0) {
          const ext = recorder.mimeType.includes('webm') ? 'webm' : 'm4a';
          const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: recorder.mimeType });
          await uploadAndSend(file);
        }
        setRecording(false);
        setRecordTime(0);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecordTime(0);
      recTimerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch {
      setUploadError('لا يمكن الوصول إلى الميكروفون. تحقق من الأذونات.');
    }
  }, [uploadAndSend]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = () => {
        recorderRef.current.stream?.getTracks().forEach(t => t.stop());
      };
      recorderRef.current.stop();
    }
    clearInterval(recTimerRef.current);
    chunksRef.current = [];
    setRecording(false);
    setRecordTime(0);
  }, []);

  const formatRecordTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`message-input-area${dragOver ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {activeAgent && (
        <div className="active-agent-bar">
          {activeAgent.avatar} يرد {activeAgent.name} على رسائلك
        </div>
      )}

      {/* Upload error banner */}
      {uploadError && (
        <div className="upload-error-banner" role="alert">
          <span>⚠️ {uploadError}</span>
          <button
            className="upload-error-dismiss"
            onClick={() => setUploadError(null)}
            aria-label="إغلاق"
          >✕</button>
        </div>
      )}

      {/* Drag-and-drop hint */}
      {dragOver && (
        <div className="drop-overlay" aria-hidden="true">اسحب الملف هنا للإرفاق</div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="upload-progress-wrap">
          <div className="upload-progress-meta">
            <span className="upload-progress-name" title={pendingFile?.name}>
              {pendingFile?.name}
              {pendingFile && <span className="upload-file-size"> ({formatBytes(pendingFile.size)})</span>}
            </span>
            <button className="upload-cancel-btn" onClick={cancelUpload} title="إلغاء">✕</button>
          </div>
          <div className="upload-progress-bar">
            <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="upload-progress-label">{uploadProgress}%</span>
        </div>
      )}

      {showEmoji && (
        <div className="emoji-tray">
          {EMOJI_LIST.map(e => (
            <button key={e} className="emoji-btn" onClick={() => { setText(t => t + e); setShowEmoji(false); }}>
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="input-row">
        <button className="btn-icon input-action" onClick={() => setShowEmoji(v => !v)} title="إيموجي">
          😊
        </button>

        <button
          className="btn-icon input-action"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || recording}
          title="إرفاق ملف"
        >
          {uploading ? '⏳' : '📎'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,audio/*,video/*,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <button
          className="btn-icon input-action"
          onClick={handleCamera}
          disabled={uploading || recording}
          title="التقاط صورة"
        >
          📷
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleCameraChange}
        />

        {recording ? (
          <>
            <div className="recording-indicator">
              <span className="rec-dot" />
              <span className="rec-time">{formatRecordTime(recordTime)}</span>
            </div>
            <button className="btn-icon input-action rec-cancel" onClick={cancelRecording} title="إلغاء">
              🗑️
            </button>
            <button className="btn-send rec-send" onClick={stopRecording} title="إرسال التسجيل">
              ➤
            </button>
          </>
        ) : (
          <>
            <textarea
              className="chat-textarea"
              placeholder="اكتب رسالة..."
              value={text}
              onChange={handleType}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={4000}
            />

            {text.trim() ? (
              <button
                className="btn-send"
                onClick={handleSend}
                disabled={!text.trim()}
                title="إرسال"
              >
                ➤
              </button>
            ) : (
              <button
                className="btn-icon input-action btn-mic"
                onClick={startRecording}
                disabled={uploading}
                title="تسجيل صوتي"
              >
                🎤
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

