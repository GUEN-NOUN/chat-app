import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { api } from '../../services/api';

const roomIcons = {
  public: '🌐', group: '👥', dm: '💬', ai: '🤖', lesson: '📚'
};

export default function HomePage() {
  const { user, token } = useAuth();
  const { rooms, joinRoom, connected, dispatch } = useChat();
  const navigate = useNavigate();

  const [search, setSearch]               = useState('');
  const [tab, setTab]                     = useState('chats'); // 'chats' | 'search'
  const [userResults, setUserResults]     = useState([]);
  const [allUsers, setAllUsers]           = useState([]);
  const [searching, setSearching]         = useState(false);

  // Multi-step create group
  const [createStep, setCreateStep]       = useState(null); // null | 'name' | 'members'
  const [roomName, setRoomName]           = useState('');
  const [memberSearch, setMemberSearch]   = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]); // [{id, username}]
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Load all users on mount for chats tab
  useEffect(() => {
    if (!token) return;
    api.searchUsers('', token).then(res => {
      if (res.ok) setAllUsers(res.users || []);
    }).catch(() => {});
  }, [token]);

  // Member search in create-group step 2
  useEffect(() => {
    if (createStep !== 'members') return;
    const q = memberSearch.trim();
    api.searchUsers(q, token).then(res => {
      if (res.ok) {
        const filtered = (res.users || []).filter(u => u.id !== user?.id);
        setMemberResults(filtered);
      }
    }).catch(() => {});
  }, [memberSearch, createStep, token, user]);

  function handleRoomClick(roomId) {
    joinRoom(roomId);
    navigate(`/chat/room/${roomId}`);
  }

  // Click on a user → open or create a DM room
  async function handleUserClick(targetUser) {
    // Find existing DM between current user and target
    const existing = rooms.find(r =>
      r.type === 'dm' && r.description &&
      r.description.includes(user.id) && r.description.includes(targetUser.id)
    );
    if (existing) {
      joinRoom(existing.id);
      navigate(`/chat/room/${existing.id}`);
      return;
    }
    // Create new DM room
    const res = await api.createRoom(
      { name: targetUser.username, type: 'dm', description: `${user.id}:${targetUser.id}` },
      token
    );
    if (!res?.ok) return;
    // Add the other user as member
    await api.addMember(res.room.id, targetUser.id, token);
    dispatch({ type: 'SET_ROOMS', rooms: [...rooms, res.room] });
    joinRoom(res.room.id);
    navigate(`/chat/room/${res.room.id}`);
  }

  // AI workflow: find or create AI room
  async function handleAgentClick() {
    let room = rooms.find(r => r.type === 'ai');
    if (!room) {
      const res = await api.createRoom(
        { name: 'المساعد الذكي', type: 'ai', description: 'agent-workflow' },
        token
      );
      if (!res.ok) return;
      room = res.room;
      dispatch({ type: 'SET_ROOMS', rooms: [...rooms, room] });
    }
    joinRoom(room.id);
    navigate(`/chat/room/${room.id}`);
  }

  // Create group: step 1 — enter name
  function handleNameNext(e) {
    e.preventDefault();
    const name = roomName.trim();
    if (!name) return;
    setMemberSearch('');
    setSelectedMembers([]);
    setCreateStep('members');
  }

  // Create group: step 2 — toggle member selection
  function toggleMember(u) {
    setSelectedMembers(prev =>
      prev.some(m => m.id === u.id)
        ? prev.filter(m => m.id !== u.id)
        : [...prev, { id: u.id, username: u.username }]
    );
  }

  // Create group: step 2 — final create
  async function handleCreateGroup(e) {
    e.preventDefault();
    const name = roomName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const res = await api.createRoom({ name, type: 'group' }, token);
      if (res.ok) {
        // Add selected members to the new room
        await Promise.all(
          selectedMembers.map(m => api.addMember(res.room.id, m.id, token))
        );
        dispatch({ type: 'SET_ROOMS', rooms: [...rooms, res.room] });
        joinRoom(res.room.id);
        navigate(`/chat/room/${res.room.id}`);
      }
    } finally {
      setCreatingGroup(false);
      setCreateStep(null);
      setRoomName('');
      setSelectedMembers([]);
    }
  }

  function cancelCreate() {
    setCreateStep(null);
    setRoomName('');
    setSelectedMembers([]);
    setMemberSearch('');
  }

  // Search handler for search tab
  const handleSearch = useCallback(async (q) => {
    setSearch(q);
    if (tab === 'search' && q.trim().length >= 1) {
      setSearching(true);
      try {
        const res = await api.searchUsers(q.trim(), token);
        if (res.ok) setUserResults(res.users || []);
      } catch { /* silent */ }
      setSearching(false);
    }
  }, [tab, token]);

  // Filter rooms in chats tab — exclude AI rooms (they live in the AI tab)
  const filteredRooms = useMemo(() => {
    const nonAi = rooms.filter(r => r.type !== 'ai');
    if (!search.trim()) return nonAi;
    const q = search.trim().toLowerCase();
    return nonAi.filter(r => r.name.toLowerCase().includes(q));
  }, [rooms, search]);

  // Filter users in chats tab
  const filteredUsers = useMemo(() => {
    const base = allUsers.filter(u => u.id !== user?.id);
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter(u => u.username?.toLowerCase().includes(q));
  }, [allUsers, search, user]);

  return (
    <div className="page home-page">
      {/* Header */}
      <header className="page-header">
        <h1 className="page-title">الرئيسية</h1>
        <div className="header-actions">
          <div className={`conn-indicator ${connected ? 'online' : 'offline'}`}>
            {connected ? '🟢' : '🔴'}
          </div>
          <button
            className="btn-icon-header"
            onClick={() => setCreateStep('name')}
            title="مجموعة جديدة"
          >
            ➕
          </button>
        </div>
      </header>

      {/* ── Create Group: Step 1 — Name ── */}
      {createStep === 'name' && (
        <div className="create-group-overlay">
          <form className="create-group-card" onSubmit={handleNameNext}>
            <h3 className="create-group-title">➕ مجموعة جديدة</h3>
            <input
              className="create-room-input"
              placeholder="اسم المجموعة"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              maxLength={60}
              autoFocus
            />
            <div className="create-group-actions">
              <button type="submit" className="btn-sm" disabled={!roomName.trim()}>
                التالي ←
              </button>
              <button type="button" className="btn-sm btn-cancel" onClick={cancelCreate}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Create Group: Step 2 — Members ── */}
      {createStep === 'members' && (
        <div className="create-group-overlay">
          <form className="create-group-card create-group-members" onSubmit={handleCreateGroup}>
            <h3 className="create-group-title">👥 إضافة أعضاء</h3>
            <p className="create-group-subtitle">المجموعة: <b>{roomName}</b></p>

            {/* Selected chips */}
            {selectedMembers.length > 0 && (
              <div className="member-chips">
                {selectedMembers.map(m => (
                  <span key={m.id} className="member-chip">
                    {m.username}
                    <button
                      type="button"
                      className="member-chip-remove"
                      onClick={() => toggleMember(m)}
                    >✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Search users */}
            <input
              className="create-room-input"
              placeholder="🔍 ابحث عن مستخدم..."
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              autoFocus
            />

            {/* User list */}
            <div className="member-select-list">
              {memberResults.filter(u => !selectedMembers.some(m => m.id === u.id)).map(u => (
                <div
                  key={u.id}
                  className="member-select-item"
                  onClick={() => toggleMember(u)}
                >
                  <div className="home-item-icon user-icon">{u.username?.[0] || '👤'}</div>
                  <div className="home-item-info">
                    <span className="home-item-name">{u.username}</span>
                    <span className="home-item-desc">
                      {u.status === 'online' ? '🟢 متصل' : '⚪ غير متصل'}
                    </span>
                  </div>
                  <span className="member-add-icon">＋</span>
                </div>
              ))}
              {memberResults.length === 0 && (
                <div className="home-empty">
                  {memberSearch.trim() ? 'لم يُعثر على مستخدمين' : 'ابحث لإضافة أعضاء'}
                </div>
              )}
            </div>

            <div className="create-group-actions">
              <button type="submit" className="btn-sm" disabled={creatingGroup}>
                {creatingGroup ? '...' : `إنشاء${selectedMembers.length ? ` (${selectedMembers.length} عضو)` : ''}`}
              </button>
              <button type="button" className="btn-sm btn-cancel" onClick={cancelCreate}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="home-tabs">
        <button
          className={`home-tab ${tab === 'chats' ? 'active' : ''}`}
          onClick={() => { setTab('chats'); setSearch(''); }}
        >
          💬 المحادثات
        </button>
        <button
          className={`home-tab ${tab === 'search' ? 'active' : ''}`}
          onClick={() => { setTab('search'); setSearch(''); setUserResults([]); }}
        >
          🔍 البحث
        </button>
      </div>

      {/* Search bar */}
      <div className="home-search">
        <input
          className="home-search-input"
          placeholder={tab === 'chats' ? '🔍 بحث في المحادثات...' : '🔍 بحث بالاسم أو المعرّف...'}
          value={search}
          onChange={e => tab === 'search' ? handleSearch(e.target.value) : setSearch(e.target.value)}
        />
      </div>

      {/* ── CHATS TAB ── */}
      {tab === 'chats' && (
        <div className="home-list">
          {/* Rooms section */}
          {filteredRooms.length > 0 && (
            <div className="home-section-label">المجموعات والغرف</div>
          )}
          {filteredRooms.map(room => (
            <div
              key={room.id}
              className="home-list-item"
              onClick={() => handleRoomClick(room.id)}
            >
              <div className="home-item-icon">{roomIcons[room.type] || '💬'}</div>
              <div className="home-item-info">
                <span className="home-item-name">{room.name}</span>
                <span className="home-item-desc">{room.description || room.type}</span>
              </div>
              <div className="home-item-arrow">←</div>
            </div>
          ))}

          {/* Users section */}
          {filteredUsers.length > 0 && (
            <div className="home-section-label">المستخدمون</div>
          )}
          {filteredUsers.map(u => (
            <div key={u.id} className="home-list-item user-item" onClick={() => handleUserClick(u)} style={{cursor:'pointer'}}>
              <div className="home-item-icon user-icon">{u.username?.[0] || '👤'}</div>
              <div className="home-item-info">
                <span className="home-item-name">{u.username}</span>
                <span className="home-item-desc">
                  {u.status === 'online' ? '🟢 متصل' : '⚪ غير متصل'}
                </span>
              </div>
            </div>
          ))}

          {filteredRooms.length === 0 && filteredUsers.length === 0 && (
            <div className="home-empty">لا توجد محادثات</div>
          )}
        </div>
      )}

      {/* ── SEARCH TAB ── */}
      {tab === 'search' && (
        <div className="home-list">
          {searching && <div className="home-empty">جارٍ البحث...</div>}
          {!searching && search.trim() && userResults.length === 0 && (
            <div className="home-empty">لم يُعثر على مستخدمين</div>
          )}
          {!searching && !search.trim() && (
            <div className="home-empty">ابحث عن مستخدم بالاسم أو المعرّف</div>
          )}
          {userResults.map(u => (
            <div key={u.id} className="home-list-item user-item" onClick={() => handleUserClick(u)} style={{cursor:'pointer'}}>
              <div className="home-item-icon user-icon">{u.username?.[0] || '👤'}</div>
              <div className="home-item-info">
                <span className="home-item-name">{u.username}</span>
                <span className="home-item-desc">
                  {u.status === 'online' ? '🟢 متصل' : '⚪ غير متصل'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
