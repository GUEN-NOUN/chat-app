import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { api } from '../../services/api';

const WORKFLOW_AGENT = {
  id: 'agent-workflow',
  name: 'المساعد الذكي',
  description: 'يوجّه سؤالك تلقائياً لأفضل نموذج ذكاء اصطناعي',
  avatar: '🧠'
};

const CAPABILITIES = [
  { emoji: '🎓', label: 'بحث أكاديمي' },
  { emoji: '🔍', label: 'تحليل الصور' },
  { emoji: '💻', label: 'برمجة وكود' },
  { emoji: '🧮', label: 'رياضيات ومنطق' },
  { emoji: '📊', label: 'إنشاء العروض' },
  { emoji: '📝', label: 'إنشاء المستندات' },
  { emoji: '📚', label: 'بحث عميق' },
  { emoji: '📋', label: 'تلخيص النصوص' },
  { emoji: '🌐', label: 'ترجمة' },
  { emoji: '⚡', label: 'إجابات سريعة' },
  { emoji: '🔤', label: 'اللغة العربية' },
  { emoji: '📓', label: 'تحليل NotebookLM' },
  { emoji: '🎤', label: 'تحويل الصوت لنص' },
];

export default function AgentsPage() {
  const { token, user } = useAuth();
  const { rooms, messages, joinRoom, dispatch } = useChat();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const aiRoom = rooms.find(r => r.type === 'ai');
  const roomMsgs = aiRoom ? (messages[aiRoom.id] || []) : [];
  const lastMsg  = roomMsgs[roomMsgs.length - 1];
  const hasHistory = aiRoom && roomMsgs.length > 0;

  async function startChat() {
    if (!token) { setError('يجب تسجيل الدخول أولاً'); return; }
    setLoading(true);
    setError(null);
    try {
      let room = aiRoom;
      if (!room) {
        const res = await api.createRoom(
          { name: WORKFLOW_AGENT.name, type: 'ai', description: WORKFLOW_AGENT.id },
          token
        );
        if (!res?.ok) {
          setError('تعذّر إنشاء المحادثة. تحقق من الاتصال.');
          return;
        }
        room = res.room;
        dispatch({ type: 'SET_ROOMS', rooms: [...rooms, room] });
      }
      joinRoom(room.id);
      navigate(`/chat/room/${room.id}`);
    } catch (err) {
      setError('حدث خطأ. حاول مجدداً.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page agents-page">
      <header className="page-header">
        <h1 className="page-title">🤖 الذكاء الاصطناعي</h1>
      </header>

      <div className="agents-page-content">
        <p className="agents-page-subtitle">
          مساعد ذكي يوجّه أسئلتك لأفضل نموذج تلقائياً
        </p>

        {error && (
          <div className="agent-error-banner" onClick={() => setError(null)}>
            ⚠️ {error}
          </div>
        )}

        <div className="agents-card-list">
          <div className="agent-page-card agent-auto-card">
            <div className="agent-page-avatar">{WORKFLOW_AGENT.avatar}</div>
            <div className="agent-page-info">
              <h3 className="agent-page-name">{WORKFLOW_AGENT.name}</h3>
              {hasHistory ? (
                <p className="agent-page-desc agent-last-msg">
                  💬 {lastMsg.body?.slice(0, 50)}{lastMsg.body?.length > 50 ? '...' : ''}
                </p>
              ) : (
                <p className="agent-page-desc">{WORKFLOW_AGENT.description}</p>
              )}
            </div>
            <button
              className={`btn-start-agent btn-auto-agent ${hasHistory ? 'btn-resume-agent' : ''}`}
              onClick={startChat}
              disabled={loading}
            >
              {loading ? '⏳' : hasHistory ? 'استأنف ↩' : 'ابدأ محادثة →'}
            </button>
          </div>
        </div>

        <div className="agent-capabilities" style={{ marginTop: '24px' }}>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem' }}>
            يدعم المساعد الذكي:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            {CAPABILITIES.map(c => (
              <span key={c.label} style={{
                background: 'var(--bg-secondary, #f0f0f0)',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                color: 'var(--text-primary)'
              }}>
                {c.emoji} {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
