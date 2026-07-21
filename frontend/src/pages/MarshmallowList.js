import React, { useState, useEffect } from 'react';
import { marshmallowService, authService } from '../services';
import BackButton from '../components/BackButton';
import '../styles/App.css';

const MarshmallowList = () => {
  const [user, setUser] = useState(null);
  const [marshmallows, setMarshmallows] = useState([]);
  const [bindId, setBindId] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    if (currentUser) {
      fetchMyMarshmallows();
    }
  }, []);

  const fetchMyMarshmallows = async () => {
    try {
      const data = await marshmallowService.getMyMarshmallows();
      setMarshmallows(data);
    } catch (error) {
      console.error('Error fetching marshmallows:', error);
    }
  };

  const handleBind = async (e) => {
    e.preventDefault();
    if (!bindId) return;
    setMessage({ type: '', text: '' });

    try {
      await marshmallowService.bindMarshmallow(bindId);
      setMessage({ type: 'success', text: '棉花糖绑定成功！' });
      setBindId('');
      fetchMyMarshmallows();
    } catch (error) {
      setMessage({ type: 'error', text: '绑定失败，ID可能无效或已被绑定。' });
    }
  };

  if (!user) {
    return (
      <div className="container">
        <div className="empty-state">
          <p>请先登录以查看您的棉花糖列表。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <BackButton to="/marshmallows" />
      <h1 className="page-title">我的棉花糖</h1>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>绑定未登录时发送的棉花糖</h3>
          {message.text && (
            <div className={message.type === 'error' ? 'form-error' : 'form-success'} style={{ marginBottom: '1rem' }}>
              {message.text}
            </div>
          )}
          <form onSubmit={handleBind} style={{ display: 'flex', gap: '1rem' }}>
            <input
              type="text"
              className="form-input"
              value={bindId}
              onChange={(e) => setBindId(e.target.value)}
              placeholder="输入棉花糖ID"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-secondary">绑定</button>
          </form>
        </div>

        {marshmallows.length === 0 ? (
          <div className="empty-state">
            <p>你还没有发送过棉花糖哦</p>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: '1fr', marginTop: '0' }}>
            {marshmallows.map((m) => (
              <div key={m.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <h3 style={{ color: 'var(--primary-purple)', margin: 0 }}>
                    {m.title || '无标题'}
                  </h3>
                  <span style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>{m.content}</p>

                {m.reply_content && (
                  <div style={{ background: 'var(--bg-purple-light)', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
                    <p style={{ fontWeight: 'bold', color: 'var(--dark-purple)', marginBottom: '0.5rem' }}>
                      管理员回复 ({new Date(m.reply_at).toLocaleDateString()}):
                    </p>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{m.reply_content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarshmallowList;
