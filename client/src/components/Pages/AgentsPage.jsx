import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { api } from '../../services/api';

const AUTO_AGENT = {
  id: 'agent-auto',
  name: 'مساعد ذكي',
  description: 'يختار أفضل وكيل تلقائياً حسب سؤالك',
  avatar: '🎯',
  provider: 'auto',
  _virtual: true
};

export default function AgentsPage() {
  const { token, user } = useAuth();
  const { agents, rooms, messages, joinRoom, dispatch } = useChat();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null); // agentId being loaded
  const [error, setError]     = useState(null);

  // Show auto-agent first, then DB agents
  const allAgents = [AUTO_AGENT, ...agents];

  async function startChat(agent) {
    if (!token) { setError('يجب تسجيل الدخول أولاً'); return; }
    setLoading(agent.id);
    setError(null);
    try {
      // Only reuse rooms this user created (to ensure membership)
      let room = rooms.find(r =>
        r.type === 'ai' &&
        r.description === agent.id &&
        r.created_by === user?.id
      );
      if (!room) {
        const res = await api.createRoom(
          { name: agent.name, type: 'ai', description: agent.id },
          token
        );
        if (!res?.ok) {
          setError('تعذّر إنشاء المحادثة. تحقق من الاتصال.');
          return;
        }
        room = res.room;
        dispatch({ type: 'SET_ROOMS', rooms: [...rooms, room] });
      }
      const agentId = agent._virtual ? null : agent.id;
      if (agentId) dispatch({ type: 'SET_ACTIVE_AGENT', agentId });
      joinRoom(room.id);
      navigate(`/chat/room/${room.id}`);
    } catch (err) {
      setError('حدث خطأ. حاول مجدداً.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="page agents-page">
      <header className="page-header">
        <h1 className="page-title">🤖 الذكاء الاصطناعي</h1>
      </header>

      <div className="agents-page-content">
        <p className="agents-page-subtitle">
          اختر مساعداً للبدء في محادثة مباشرة
        </p>

        {error && (
          <div className="agent-error-banner" onClick={() => setError(null)}>
            ⚠️ {error}
          </div>
        )}

        {agents.length === 0 && (
          <div className="home-empty" style={{ marginTop: '40px' }}>
            <span style={{ fontSize: '3rem' }}>🔌</span>
            <p>جارٍ تحميل الوكلاء...</p>
          </div>
        )}

        <div className="agents-card-list">
          {allAgents.map(agent => {
            const room = rooms.find(r =>
              r.type === 'ai' &&
              r.description === agent.id &&
              r.created_by === user?.id
            );
            const roomMsgs = room ? (messages[room.id] || []) : [];
            const lastMsg  = roomMsgs[roomMsgs.length - 1];
            const hasHistory = room && roomMsgs.length > 0;
            const isLoading  = loading === agent.id;

            return (
              <div key={agent.id} className={`agent-page-card${agent._virtual ? ' agent-auto-card' : ''}`}>
                <div className="agent-page-avatar">{agent.avatar || '🤖'}</div>
                <div className="agent-page-info">
                  <h3 className="agent-page-name">{agent.name}</h3>
                  {hasHistory ? (
                    <p className="agent-page-desc agent-last-msg">
                      💬 {lastMsg.body?.slice(0, 50)}{lastMsg.body?.length > 50 ? '...' : ''}
                    </p>
                  ) : (
                    <p className="agent-page-desc">{agent.description || agent.provider}</p>
                  )}
                  {!agent._virtual && (
                    <span className="agent-page-provider">{agent.provider}</span>
                  )}
                </div>
                <button
                  className={`btn-start-agent ${hasHistory ? 'btn-resume-agent' : ''} ${agent._virtual ? 'btn-auto-agent' : ''}`}
                  onClick={() => startChat(agent)}
                  disabled={isLoading}
                >
                  {isLoading ? '⏳' : hasHistory ? 'استأناف ↩' : 'ابدأ →'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
