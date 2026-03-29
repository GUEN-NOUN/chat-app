import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

export default function ProfilePage() {
  const { user, login, logout, token } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem('madarik_notif') !== '0');
  const avatarInputRef = useRef(null);

  const deviceId = localStorage.getItem('madarik_device_id') || '';
  const shortId = deviceId.slice(0, 8);

  function startEdit() {
    setName(user?.username || '');
    setError('');
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) { setError('الاسم يجب أن يكون حرفين على الأقل'); return; }
    if (trimmed.length > 30) { setError('الاسم طويل جداً'); return; }
    setLoading(true);
    setError('');
    try {
      await login(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('حجم الصورة يجب أن يكون أقل من 5 MB'); return; }
    setAvatarUploading(true);
    setError('');
    try {
      const res = await api.uploadFile(file, token);
      if (res.ok && res.url) {
        setAvatarUrl(res.url);
        localStorage.setItem('madarik_avatar', res.url);
      } else {
        setError('فشل رفع الصورة');
      }
    } catch {
      setError('فشل الاتصال بالخادم');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  function toggleNotif() {
    const next = !notifEnabled;
    setNotifEnabled(next);
    localStorage.setItem('madarik_notif', next ? '1' : '0');
  }

  // Load saved avatar
  const savedAvatar = avatarUrl || localStorage.getItem('madarik_avatar');

  return (
    <div className="page profile-page">
      {/* Header */}
      <header className="page-header">
        <h1 className="page-title">حسابي</h1>
      </header>

      <div className="profile-content">
        {/* Avatar */}
        <div className="profile-avatar-wrap" onClick={() => avatarInputRef.current?.click()}>
          <div className="profile-avatar">
            {savedAvatar
              ? <img src={savedAvatar} alt="avatar" className="profile-avatar-img" />
              : (user?.username?.[0] || '👤')
            }
          </div>
          <div className="profile-avatar-overlay">
            {avatarUploading ? '⏳' : '📷'}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>

        {/* Username */}
        <h2 className="profile-username">{user?.username}</h2>

        {/* ID */}
        <p className="profile-id">🆔 المعرّف: {shortId}</p>

        {/* Info cards */}
        <div className="profile-info-card">
          <div className="profile-info-row">
            <span className="profile-info-label">📱 معرّف الجهاز</span>
            <span className="profile-info-value">{shortId}...</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-label">👤 الاسم</span>
            <span className="profile-info-value">{user?.username}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-label">🟢 الحالة</span>
            <span className="profile-info-value">متصل</span>
          </div>
        </div>

        {/* Edit form */}
        {editing ? (
          <form className="profile-edit-form" onSubmit={handleSave}>
            <input
              type="text"
              className="profile-edit-input"
              placeholder="الاسم الجديد"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={30}
              autoFocus
              autoComplete="off"
            />
            {error && <p className="profile-error">{error}</p>}
            <div className="profile-edit-buttons">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ ✔'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setEditing(false)}>
                إلغاء
              </button>
            </div>
          </form>
        ) : (
          <button className="btn-edit-profile" onClick={startEdit}>
            ✏️ تعديل الحساب
          </button>
        )}

        {/* Settings */}
        <div className="profile-settings-card">
          <h3 className="profile-settings-title">⚙️ الإعدادات</h3>

          <div className="profile-setting-row" onClick={toggleNotif}>
            <span className="profile-setting-label">🔔 الإشعارات</span>
            <span className={`profile-toggle ${notifEnabled ? 'on' : ''}`}>
              <span className="profile-toggle-knob" />
            </span>
          </div>

          <div className="profile-setting-row" onClick={() => avatarInputRef.current?.click()}>
            <span className="profile-setting-label">📷 تغيير الصورة</span>
            <span className="profile-setting-arrow">←</span>
          </div>

          <div className="profile-setting-row" onClick={startEdit}>
            <span className="profile-setting-label">✏️ تغيير الاسم</span>
            <span className="profile-setting-arrow">←</span>
          </div>
        </div>

        {error && !editing && <p className="profile-error">{error}</p>}

        {/* Logout */}
        <button className="btn-logout" onClick={logout}>
          🚪 تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
