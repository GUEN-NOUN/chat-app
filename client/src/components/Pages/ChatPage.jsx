import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import MessageBubble from '../Chat/MessageBubble';
import MessageInput from '../Chat/MessageInput';
import TypingIndicator from '../Chat/TypingIndicator';
import AgentSelector from '../Agents/AgentSelector';

export default function ChatPage() {
  const { user } = useAuth();
  const { activeRoomId, rooms, agents, messages, typingUsers, loadMore, markRead, connected, activeAgentId, dispatch } = useChat();
  const navigate = useNavigate();

  const room = rooms.find(r => r.id === activeRoomId);
  const msgs = messages[activeRoomId] || [];
  const typing = typingUsers[activeRoomId] || {};
  const bottomRef = useRef(null);
  const listRef = useRef(null);

  // Auto-set active agent when entering an AI room
  // Use room.description directly — don't wait for agents array to load
  useEffect(() => {
    if (!room || room.type !== 'ai') return;
    const agentId = room.description;
    if (agentId && agentId !== activeAgentId) {
      dispatch({ type: 'SET_ACTIVE_AGENT', agentId });
    }
  }, [room?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (msgs.length) markRead(activeRoomId, msgs[msgs.length - 1].id);
  }, [msgs.length, activeRoomId]);

  const handleScroll = useCallback(() => {
    if (listRef.current?.scrollTop === 0 && msgs.length) {
      loadMore(activeRoomId, msgs[0]?.ts);
    }
  }, [msgs, activeRoomId, loadMore]);

  const typingList = Object.entries(typing)
    .filter(([uid]) => uid !== user?.id)
    .map(([, name]) => name);

  return (
    <div className="page chat-page">
      {/* Header */}
      <header className="chat-page-header">
        <button className="btn-back" onClick={() => navigate('/chat/')}>
          →
        </button>
        <div className="chat-page-room-info">
          <div className="chat-page-avatar">
            {room?.type === 'ai' ? '🤖' : room?.type === 'dm' ? '💬' : '👥'}
          </div>
          <div className="chat-page-details">
            <span className="chat-page-room-name">{room?.name || '...'}</span>
            <span className="chat-page-status">
              {connected ? '🟢 متصل' : '🔴 غير متصل'}
            </span>
          </div>
        </div>
        <div className="chat-page-actions">
          <AgentSelector />
        </div>
      </header>

      {/* Connection banner */}
      <div className={`conn-banner${connected ? '' : ' show'}`} role="alert">
        ⚡ انقطع الاتصال — جارٍ إعادة الاتصال...
      </div>

      {/* Messages */}
      <div className="message-list" ref={listRef} onScroll={handleScroll}>
        {msgs.length === 0 && connected && (
          <div className="empty-chat">
            <span>👋</span>
            <p>لا توجد رسائل بعد. كن أول من يبدأ المحادثة!</p>
          </div>
        )}
        {msgs.length === 0 && !connected && (
          <div className="empty-chat">
            <span>⏳</span>
            <p>جارٍ تحميل الرسائل...</p>
          </div>
        )}
        {msgs.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderId === user?.id}
          />
        ))}
        {typingList.length > 0 && <TypingIndicator names={typingList} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput roomId={activeRoomId} />
    </div>
  );
}
