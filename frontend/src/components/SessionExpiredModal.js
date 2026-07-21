import React from 'react';
import '../styles/App.css';

const SessionExpiredModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="feedback-modal-backdrop feedback-system-modal-backdrop">
      <div className="feedback-modal feedback-system-modal session-expired-modal" role="dialog" aria-modal="true">
        <h2>登录已过期</h2>
        <p>您的登录状态已失效，请重新登录以继续操作。</p>
        <div className="feedback-modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            重新登录
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiredModal;
