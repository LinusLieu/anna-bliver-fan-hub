import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const FeedbackContext = createContext(null);

const DEFAULT_TOAST_DURATION = 3200;

function ToastRegion({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="feedback-toast-region" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`feedback-toast feedback-toast-${toast.type || 'info'}`}>
          <div className="feedback-toast-text">
            {toast.title && <strong>{toast.title}</strong>}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="feedback-toast-close"
            aria-label="关闭提示"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ state, onClose }) {
  if (!state) return null;

  const {
    title = '确认操作',
    message,
    detail,
    confirmText = '确认',
    cancelText = '取消',
    variant = 'warning'
  } = state;

  const close = (value) => {
    state.resolve(value);
    onClose();
  };

  return (
    <div className="feedback-modal-backdrop" role="presentation" onClick={() => close(false)}>
      <div
        className={`feedback-modal feedback-confirm feedback-modal-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="feedback-modal-header">
          <div>
            <p className="feedback-modal-kicker">需要确认</p>
            <h2 id="feedback-confirm-title">{title}</h2>
          </div>
          <button type="button" className="feedback-modal-close" aria-label="取消" onClick={() => close(false)}>
            ×
          </button>
        </div>
        {message && <p className="feedback-modal-message">{message}</p>}
        {detail && <p className="feedback-modal-detail">{detail}</p>}
        <div className="feedback-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
            {cancelText}
          </button>
          <button type="button" className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptDialog({ state, onClose }) {
  const [value, setValue] = useState(state?.defaultValue || '');

  if (!state) return null;

  const {
    title = '补充信息',
    message,
    label = '内容',
    placeholder = '',
    confirmText = '确认',
    cancelText = '取消',
    required = false,
    multiline = false,
    readOnly = false
  } = state;

  const close = (nextValue) => {
    state.resolve(nextValue);
    onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (required && !String(value).trim()) return;
    close(value);
  };

  return (
    <div className="feedback-modal-backdrop feedback-action-backdrop" role="presentation" onClick={() => close(null)}>
      <form
        className="feedback-modal feedback-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-prompt-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="feedback-modal-header">
          <div>
            <p className="feedback-modal-kicker">二级窗口</p>
            <h2 id="feedback-prompt-title">{title}</h2>
          </div>
          <button type="button" className="feedback-modal-close" aria-label="取消" onClick={() => close(null)}>
            ×
          </button>
        </div>
        {message && <p className="feedback-modal-message">{message}</p>}
        <label className="feedback-prompt-field">
          <span>{label}</span>
          {multiline ? (
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              rows={readOnly ? 4 : 3}
              readOnly={readOnly}
              autoFocus={!readOnly}
            />
          ) : (
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              readOnly={readOnly}
              autoFocus={!readOnly}
            />
          )}
        </label>
        <div className="feedback-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => close(null)}>
            {cancelText}
          </button>
          <button type="submit" className="btn btn-primary" disabled={required && !String(value).trim()}>
            {confirmText}
          </button>
        </div>
      </form>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [promptState, setPromptState] = useState(null);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((message, options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextToast = {
      id,
      message,
      type: options.type || 'info',
      title: options.title || ''
    };
    setToasts((current) => [...current, nextToast].slice(-4));
    window.setTimeout(() => dismissToast(id), options.duration || DEFAULT_TOAST_DURATION);
    return id;
  }, [dismissToast]);

  const confirm = useCallback((options = {}) => (
    new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    })
  ), []);

  const prompt = useCallback((options = {}) => (
    new Promise((resolve) => {
      setPromptState({ ...options, resolve });
    })
  ), []);

  const value = useMemo(() => ({
    toast,
    confirm,
    prompt,
    success: (message, options = {}) => toast(message, { ...options, type: 'success' }),
    error: (message, options = {}) => toast(message, { ...options, type: 'error' }),
    warning: (message, options = {}) => toast(message, { ...options, type: 'warning' }),
    info: (message, options = {}) => toast(message, { ...options, type: 'info' })
  }), [confirm, prompt, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      {promptState && (
        <PromptDialog
          key={`${promptState.title || 'prompt'}-${promptState.defaultValue || ''}`}
          state={promptState}
          onClose={() => setPromptState(null)}
        />
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within FeedbackProvider');
  }
  return context;
}

export function InlineAlert({ type = 'info', title, children, className = '' }) {
  return (
    <div className={`feedback-inline-alert feedback-inline-alert-${type} ${className}`.trim()} role={type === 'error' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      <span>{children}</span>
    </div>
  );
}
