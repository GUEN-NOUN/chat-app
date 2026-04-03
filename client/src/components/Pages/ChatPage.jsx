import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import MessageBubble from '../Chat/MessageBubble';
import MessageInput from '../Chat/MessageInput';
import TypingIndicator from '../Chat/TypingIndicator';
import AgentSelector from '../Agents/AgentSelector';

export default function ChatPage() {
  const { user } = useAuth();
  const { activeRoomId, rooms, messages, typingUsers, loadMore, markRead, connected } = useChat();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  const room = rooms.find(r => r.id === activeRoomId);
  const msgs = messages[activeRoomId] || [];
  const typing = typingUsers[activeRoomId] || {};
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const isNearBottom = useRef(true);

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    if (msgs.length) markRead(activeRoomId, msgs[msgs.length - 1].id);
  }, [msgs.length, activeRoomId]);

  useEffect(() => { isNearBottom.current = true; }, [activeRoomId]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 5 && msgs.length) {
      loadMore(activeRoomId, msgs[0]?.ts);
    }
  }, [msgs, activeRoomId, loadMore]);

  const typingList = Object.entries(typing)
    .filter(([uid]) => uid !== user?.id)
    .map(([, name]) => name);

  const filteredMsgs = searchQuery.trim()
    ? msgs.filter(m => m.body?.toLowerCase().includes(searchQuery.toLowerCase()))
    : msgs;

  const scrollToBottom = () => {
    isNearBottom.current = true;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="page chat-page">
      {/* Header */}
      <header className="chat-page-header">
        <button className="btn-back" onClick={() => navigate('/chat/')}>
          →
        </button>
        <div className="chat-page-room-info" onClick={() => setShowMenu(false)}>
          <div className="chat-page-avatar">
            {room?.type === 'ai' ? '🤖' : room?.type === 'dm' ? '💬' : '👥'}
          </div>
          <div className="chat-page-details">
            <span className="chat-page-room-name">{room?.name || '...'}</span>
            <span className="chat-page-status">
              {typingList.length > 0
                ? `${typingList.join(', ')} يكتب...`
                : connected ? 'متصل' : 'غير متصل'}
            </span>
          </div>
        </div>
        <div className="chat-page-actions">
          {room?.type === 'ai' && <AgentSelector />}
          <button className="btn-header-action" onClick={() => { setSearchOpen(s => !s); setSearchQuery(''); }} title="بحث">
            🔍
          </button>
          <div className="header-menu-wrap">
            <button className="btn-header-action" onClick={() => setShowMenu(v => !v)} title="المزيد">
              ⋮
            </button>
            {showMenu && (
              <div className="header-dropdown" onClick={() => setShowMenu(false)}>
                <button className="header-dropdown-item" onClick={scrollToBottom}>⬇ آخر الرسائل</button>
                <button className="header-dropdown-item" onClick={() => setSearchOpen(true)}>🔍 بحث في المحادثة</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search bar */}
      {searchOpen && (
        <div className="chat-search-bar">
          <input
            className="chat-search-input"
            placeholder="بحث في المحادثة..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          <span className="chat-search-count">
            {searchQuery.trim() ? `${filteredMsgs.length} نتيجة` : ''}
          </span>
          <button className="chat-search-close" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>✕</button>
        </div>
      )}

      {/* Connection banner */}
      <div className={`conn-banner${connected ? '' : ' show'}`} role="alert">
        ⚡ انقطع الاتصال — جارٍ إعادة الاتصال...
      </div>

      {/* Messages */}
      <div className="message-list" ref={listRef} onScroll={handleScroll}>
        {filteredMsgs.length === 0 && connected && !searchQuery.trim() && (
          <div className="empty-chat">
            <span>👋</span>
            <p>لا توجد رسائل بعد. كن أول من يبدأ المحادثة!</p>
          </div>
        )}
        {filteredMsgs.length === 0 && searchQuery.trim() && (
          <div className="empty-chat">
            <span>🔍</span>
            <p>لا توجد نتائج لـ "{searchQuery}"</p>
          </div>
        )}
        {filteredMsgs.length === 0 && !connected && !searchQuery.trim() && (
          <div className="empty-chat">
            <span>⏳</span>
            <p>جارٍ تحميل الرسائل...</p>
          </div>
        )}
        {filteredMsgs.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderId === user?.id}
          />
        ))}
        {typingList.length > 0 && <TypingIndicator names={typingList} />}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom FAB */}
      {!isNearBottom.current && msgs.length > 10 && (
        <button className="scroll-bottom-fab" onClick={scrollToBottom} title="آخر الرسائل">
          ⬇
        </button>
      )}

      {/* Input */}
      <MessageInput roomId={activeRoomId} />
    </div>
  );
}
