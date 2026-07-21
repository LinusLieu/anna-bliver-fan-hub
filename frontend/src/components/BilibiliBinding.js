import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function BilibiliBinding() {
  const [status, setStatus] = useState({ bindings: [], binding_limit: 5 });
  const [qr, setQr] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/bilibili-binding/status', { headers: authHeaders() });
    if (response.ok) setStatus(await response.json());
  }, []);

  useEffect(() => {
    loadStatus();
    return () => clearInterval(timer.current);
  }, [loadStatus]);

  const startPolling = (key) => {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const response = await fetch(`/api/bilibili-binding/qr/${encodeURIComponent(key)}`, { headers: authHeaders() });
      const data = await response.json();
      if (data.status === 'success') {
        clearInterval(timer.current);
        setQr(null);
        setMessage('B站账号绑定成功');
        loadStatus();
      } else if (response.status === 410 || data.status === 'expired') {
        clearInterval(timer.current);
        setQr(null);
        setMessage('二维码已过期，请重新生成');
      } else if (!response.ok) {
        clearInterval(timer.current);
        setMessage(data.message || '绑定失败');
      }
    }, 2000);
  };

  const createQr = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/bilibili-binding/qr', { method: 'POST', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '二维码创建失败');
      setQr(data);
      startPolling(data.qrcode_key);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (uid) => {
    await fetch(`/api/bilibili-binding/${uid}/primary`, { method: 'POST', headers: authHeaders() });
    loadStatus();
  };

  const unbind = async (uid) => {
    if (!window.confirm(`确认解绑 UID ${uid}？`)) return;
    const response = await fetch(`/api/bilibili-binding/${uid}`, { method: 'DELETE', headers: authHeaders() });
    const data = await response.json();
    setMessage(response.ok ? '已解绑' : data.message);
    if (response.ok) loadStatus();
  };

  const bindings = status.bindings || [];
  return (
    <section className="binding-panel">
      <div className="binding-heading">
        <div>
          <h3>B站账号绑定</h3>
          <p>已绑定 {bindings.length}/{status.binding_limit || 5} 个账号，积分会合并到同一个钱包。</p>
        </div>
        <button type="button" onClick={createQr} disabled={busy || bindings.length >= (status.binding_limit || 5)}>
          {busy ? '生成中...' : '扫码绑定'}
        </button>
      </div>

      {message && <p className="binding-message">{message}</p>}
      {qr && (
        <div className="binding-qr">
          <QRCodeSVG value={qr.url} size={184} level="M" />
          <p>请使用哔哩哔哩 App 扫码并确认</p>
        </div>
      )}

      <div className="binding-list">
        {bindings.map((binding) => (
          <article key={binding.bilibili_uid} className="binding-item">
            {binding.bilibili_face && <img src={binding.bilibili_face} alt="" referrerPolicy="no-referrer" />}
            <div>
              <strong>{binding.bilibili_uname || `UID ${binding.bilibili_uid}`}</strong>
              <span>UID {binding.bilibili_uid}{binding.is_primary ? ' · 主账号' : ''}</span>
            </div>
            {!binding.is_primary && <button type="button" onClick={() => setPrimary(binding.bilibili_uid)}>设为主账号</button>}
            <button type="button" className="danger-link" onClick={() => unbind(binding.bilibili_uid)}>解绑</button>
          </article>
        ))}
      </div>
    </section>
  );
}
