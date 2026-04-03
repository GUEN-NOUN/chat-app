import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { api }     from '../../services/api';

export default function Sidebar() {
  const { user, token, logout } = useAuth();
  const { rooms, activeRoomId, joinRoom, connected, dispatch } = useChat();
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [search, setSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // Debounced user search via API
  const searchUsersApi = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setUserResults([]); setSearchingUsers(false); return; }
    setSearchingUsers(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchUsers(q.trim(), token);
        if (res.ok) setUserResults(res.users || []);
      } catch { /* ignore */ }
      setSearchingUsers(false);
    }, 300);
  }, [token]);

  useEffect(() => { searchUsersApi(search); }, [search, searchUsersApi]);
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  function handleRoomClick(roomId) {
    joinRoom(roomId);
    navigate(`/chat/room/${roomId}`);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const name = roomName.trim();
    if (!name) return;
    const res = await api.createRoom({ name, type: 'group' }, token);
    if (res.ok) {
      dispatch({ type: 'SET_ROOMS', rooms: [...rooms, res.room] });
      joinRoom(res.room.id);
      navigate(`/chat/room/${res.room.id}`);
    }
    setRoomName('');
    setCreating(false);
  }

  const roomTypes = {
    public: '🌐', group: '👥', dm: '💬', ai: '🤖', lesson: '📚'
  };

  const filteredRooms = useMemo(() => {
    if (!search.trim()) return rooms;
    const q = search.trim().toLowerCase();
    return rooms.filter(r => r.name?.toLowerCase().includes(q));
  }, [rooms, search]);

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">💬 مدارك</div>
        <div className={`conn-dot ${connected ? 'online' : 'offline'}`}
             title={connected ? 'متصل' : 'غير متصل'} />
      </div>

      {/* User badge */}
      <div className="user-badge">
        <div className="user-avatar">
          {user?.username?.[0] || '👤'}
        </div>
        <span className="user-name">{user?.username}</span>
        <button
          className="btn-icon"
          title="تغيير الاسم"
          onClick={() => window.dispatchEvent(new Event('open:editname'))}
        >✏️</button>
        <button className="btn-icon" onClick={logout} title="خروج">✕</button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <input
          className="sidebar-search-input"
          placeholder="🔍 بحث في المحادثات والمستخدمين..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* User search results */}
      {search.trim() && userResults.length > 0 && (
        <div className="user-search-results">
          <div className="section-label">مستخدمون</div>
          <ul className="room-list">
            {userResults.filter(u => u.id !== user?.id).map(u => (
              <li key={u.id} className="room-item user-result" onClick={async () => {
                // Create or find DM room
                const res = await api.createRoom({ name: `${user.username} & ${u.username}`, type: 'dm', targetUserId: u.id }, token);
                if (res.ok && res.room) {
                  dispatch({ type: 'SET_ROOMS', rooms: [...rooms.filter(r => r.id !== res.room.id), res.room] });
                  joinRoom(res.room.id);
                  navigate(`/chat/room/${res.room.id}`);
                }
                setSearch('');
              }}>
                <div className="room-icon">{u.avatar || '👤'}</div>
                <div className="room-name-wrap">
                  <span className="room-name">{u.username}</span>
                  <small className={`user-status ${u.status}`}>{u.status === 'online' ? '🟢' : '⚫'}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {search.trim() && searchingUsers && <div className="search-loading">جار البحث...</div>}

      {/* Rooms */}
      <div className="rooms-section">
        <div className="section-label">
          المحادثات
          <button className="btn-icon" onClick={() => setCreating(c => !c)} title="غرفة جديدة">+</button>
        </div>

        {creating && (
          <form className="create-room-form" onSubmit={handleCreate}>
            <input
              className="room-name-input"
              placeholder="اسم الغرفة"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              maxLength={60}
              autoFocus
            />
            <button type="submit" className="btn-sm">إنشاء</button>
          </form>
        )}

        <ul className="room-list">
          {filteredRooms.map(room => (
            <li
              key={room.id}
              className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
              onClick={() => handleRoomClick(room.id)}
            >
              <div className="room-icon">{roomTypes[room.type] || '💬'}</div>
              <span className="room-name">{room.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
