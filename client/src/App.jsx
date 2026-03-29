import React, { useEffect } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider, useChat } from './context/ChatContext';
import HomePage    from './components/Pages/HomePage';
import ChatPage    from './components/Pages/ChatPage';
import ProfilePage from './components/Pages/ProfilePage';
import AgentsPage  from './components/Pages/AgentsPage';

/** Syncs URL param → active room when the user navigates directly to a room link */
function RoomRoute() {
  const { roomId } = useParams();
  const { joinRoom, activeRoomId } = useChat();

  useEffect(() => {
    if (roomId && roomId !== activeRoomId) {
      joinRoom(roomId);
    }
  }, [roomId, activeRoomId, joinRoom]);

  return <ChatPage />;
}

/** Bottom navigation bar */
function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  // Hide bottom nav when inside a chat room
  if (path.includes('/room/')) return null;

  const tabs = [
    { id: 'home',    icon: '🏠', label: 'الرئيسية', path: '/chat/' },
    { id: 'agents',  icon: '🤖', label: 'AI',        path: '/chat/agents' },
    { id: 'profile', icon: '👤', label: 'حسابي',    path: '/chat/profile' },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`bottom-nav-tab ${path === tab.path || (tab.id === 'home' && path === '/chat') ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="bottom-nav-icon">{tab.icon}</span>
          <span className="bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function ChatLayout() {
  return (
    <ChatProvider>
      <div className="app-container">
        <Routes>
          <Route path="room/:roomId" element={<RoomRoute />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route index element={<HomePage />} />
        </Routes>
        <BottomNav />
      </div>
    </ChatProvider>
  );
}

function ChatApp() {
  const { user, ready } = useAuth();

  if (!ready) return <div className="splash">⏳ جارٍ التحميل...</div>;

  if (!user) return (
    <div className="splash splash-error">
      <p>⚠️ تعذّر الاتصال بالخادم</p>
      <p style={{fontSize:'0.85em', marginTop:'8px'}}>تأكد من تشغيل الخادم ثم أعد تحميل الصفحة</p>
      <button onClick={() => window.location.reload()} style={{marginTop:'16px',padding:'8px 20px',borderRadius:'8px',cursor:'pointer'}}>
        🔄 إعادة المحاولة
      </button>
    </div>
  );

  return (
    <Routes>
      <Route path="/chat/*" element={<ChatLayout />} />
      <Route path="*" element={<Navigate to="/chat/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ChatApp />
      </BrowserRouter>
    </AuthProvider>
  );
}
