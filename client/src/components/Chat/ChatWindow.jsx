import React, { useEffect, useRef, useCallback } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import MessageBubble  from './MessageBubble';
import MessageInput   from './MessageInput';
import TypingIndicator from './TypingIndicator';
import AgentSelector  from '../Agents/AgentSelector';

export default function ChatWindow() {
  const { user } = useAuth();
  const { activeRoomId, rooms, messages, typingUsers, loadMore, markRead, connected } = useChat();

  const room    = rooms.find(r => r.id === activeRoomId);
  const msgs    = messages[activeRoomId] || [];
  const typing  = typingUsers[activeRoomId] || {};
  const bottomRef    = useRef(null);
  const listRef      = useRef(null);
  // Track whether the user is near the bottom — don't auto-scroll if they've scrolled up
  const isNearBottom = useRef(true);

  // Auto-scroll to bottom on new messages — only if user is already near bottom
  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    // Always mark last message as read regardless of scroll position
    if (msgs.length) markRead(activeRoomId, msgs[msgs.length - 1].id);
  }, [msgs.length, activeRoomId]);

  // Reset near-bottom flag when the active room changes (always start at bottom)
  useEffect(() => {
    isNearBottom.current = true;
  }, [activeRoomId]);

  // Infinite scroll — load-more when scrolled near top
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    // Update near-bottom flag (80px threshold handles sub-pixel rounding on mobile)
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    // Trigger load-more slightly before hitting the very top (5px threshold)
    if (el.scrollTop < 5 && msgs.length) {
      loadMore(activeRoomId, msgs[0]?.ts);
    }
  }, [msgs, activeRoomId, loadMore]);

  const typingList = Object.entries(typing)
    .filter(([uid]) => uid !== user?.id)
    .map(([, name]) => name);

  return (
    <main className="chat-window">
      {/* Disconnection banner */}
      <div className={`conn-banner${connected ? '' : ' show'}`} role="alert" aria-live="assertive">
        ⚡ انقطع الاتصال — جارٍ إعادة الاتصال...
      </div>

      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-right">
          <div className="chat-header-avatar">
            {room?.type === 'ai' ? '🤖' : room?.type === 'dm' ? '💬' : '👥'}
          </div>
          <div className="chat-room-info">
            <span className="chat-room-name">{room?.name || '...'}</span>
            <span className="chat-room-desc">
              {room?.description || (connected ? 'متصل الآن' : 'غير متصل')}
            </span>
          </div>
        </div>
        <AgentSelector />
      </header>

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
    </main>
  );
}
