import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function LoginModal() {
  const { login } = useAuth();
  const [name, setName]   = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) { setError('اسمك يجب أن يكون حرفين على الأقل'); return; }
    if (trimmed.length > 30)            { setError('الاسم طويل جداً (30 حرف كحدٍ أقصى)'); return; }
    setLoading(true); setError('');
    try { await login(trimmed); }
    catch (err) { setError(err.message || 'حدث خطأ، حاول مجدداً'); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card login-card">
        <div className="login-logo">💬</div>
        <h1 className="login-title">مدارك — الدردشة</h1>
        <p className="login-subtitle">أدخل اسمك للانضمام إلى الدردشة</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            className="login-input"
            placeholder="اسمك (مثال: أحمد)"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            autoFocus
            autoComplete="off"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? 'جارٍ الدخول...' : 'ادخل الدردشة ➜'}
          </button>
        </form>
      </div>
    </div>
  );
}
