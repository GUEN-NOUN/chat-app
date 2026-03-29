import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * EditNameModal — rendered inside ChatLayout.
 * Hidden by default; shown when user clicks the edit-name button in Sidebar.
 * Uses a custom event 'open:editname' to decouple from Sidebar state.
 */
export default function EditNameModal() {
  const { user, login } = useAuth();
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Listen for the custom open event from Sidebar
  React.useEffect(() => {
    function handler() {
      setName(user?.username || '');
      setError('');
      setOpen(true);
    }
    window.addEventListener('open:editname', handler);
    return () => window.removeEventListener('open:editname', handler);
  }, [user]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) { setError('الاسم يجب أن يكون حرفين على الأقل'); return; }
    if (trimmed.length > 30)            { setError('الاسم طويل جداً (30 حرفاً كحدٍّ أقصى)'); return; }
    setLoading(true); setError('');
    try {
      await login(trimmed);
      setOpen(false);
    } catch (err) {
      setError(err.message || 'حدث خطأ، حاول مجدداً');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal-card login-card" onClick={e => e.stopPropagation()}>
        <div className="login-logo">✏️</div>
        <h2 className="login-title">تغيير الاسم</h2>
        <p className="login-subtitle">اسمك الحالي: <strong>{user?.username}</strong></p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            className="login-input"
            placeholder="الاسم الجديد"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            autoFocus
            autoComplete="off"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? 'جارٍ الحفظ...' : 'حفظ الاسم ✔'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}
            style={{marginTop:'8px', width:'100%', padding:'10px', borderRadius:'8px',
                    background:'transparent', border:'1px solid #444', color:'#aaa', cursor:'pointer'}}>
            إلغاء
          </button>
        </form>
      </div>
    </div>
  );
}
