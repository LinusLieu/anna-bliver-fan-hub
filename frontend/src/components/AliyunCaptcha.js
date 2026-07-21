/**
 * 阿里云验证码2.0组件
 * 使用V3架构，无痕验证模式
 *
 * 使用方式：将验证码绑定到业务按钮，点击按钮触发验证，验证通过后自动执行业务逻辑
 */
import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useLayoutEffect } from 'react';
import { settingsService } from '../services';

// 全局加载状态
let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks = [];

/**
 * 加载阿里云验证码脚本
 */
function loadCaptchaScript() {
  return new Promise((resolve, reject) => {
    if (scriptLoaded) {
      resolve();
      return;
    }

    if (scriptLoading) {
      loadCallbacks.push({ resolve, reject });
      return;
    }

    scriptLoading = true;

    const script = document.createElement('script');
    script.src = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';
    script.async = true;

    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
      loadCallbacks.forEach(cb => cb.resolve());
      loadCallbacks.length = 0;
    };

    script.onerror = (error) => {
      scriptLoading = false;
      reject(new Error('加载验证码脚本失败'));
      loadCallbacks.forEach(cb => cb.reject(error));
      loadCallbacks.length = 0;
    };

    document.head.appendChild(script);
  });
}

// 生成唯一ID
let captchaIdCounter = 0;
const generateCaptchaId = (prefix = 'btn') => `aliyun-captcha-${prefix}-${++captchaIdCounter}`;

/**
 * 阿里云无痕验证码组件
 *
 * @param {Object} props
 * @param {Function} props.onSuccess - 验证成功回调，接收 (captchaVerifyParam) 参数，返回Promise或boolean表示业务结果
 * @param {Function} props.onError - 验证失败或出错回调
 * @param {string} props.buttonText - 按钮文本
 * @param {string} props.loadingText - 加载中文本
 * @param {boolean} props.disabled - 是否禁用按钮
 * @param {boolean} props.loading - 业务加载状态（如登录中、发送中）
 * @param {string} props.className - 按钮样式类名
 * @param {Object} props.style - 按钮自定义样式
 * @param {string} props.type - 按钮类型，'primary' 或 'secondary'
 */
const AliyunCaptcha = forwardRef(({
  onSuccess,
  onError,
  buttonText = '提交',
  loadingText = '处理中...',
  disabled = false,
  loading = false,
  className = '',
  style = {},
  type = 'primary'
}, ref) => {
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState(null);
  const [buttonMounted, setButtonMounted] = useState(false);
  const captchaInstanceRef = useRef(null);
  const buttonIdRef = useRef(generateCaptchaId('btn'));
  const captchaContainerIdRef = useRef(generateCaptchaId('container'));
  const buttonRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const initAttemptedRef = useRef(false);

  // 保持回调函数的最新引用
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const captchaConfig = await settingsService.getCaptchaConfig();
        if (captchaConfig.enabled) {
          setConfig(captchaConfig);
        } else {
          // 验证码未启用
          setCaptchaLoading(false);
          setError('SKIP');
        }
      } catch (err) {
        console.error('获取验证码配置失败:', err);
        setError('获取验证码配置失败');
        setCaptchaLoading(false);
      }
    };
    loadConfig();
  }, []);

  // 标记按钮已挂载
  useLayoutEffect(() => {
    if (buttonRef.current) {
      setButtonMounted(true);
    }
  }, []);

  // 初始化验证码 - 必须在按钮挂载后执行
  const initCaptcha = useCallback(async () => {
    if (!config || !buttonMounted || initAttemptedRef.current) return;

    // 确保按钮和容器元素都存在于DOM中
    const buttonElement = document.getElementById(buttonIdRef.current);
    const containerElement = document.getElementById(captchaContainerIdRef.current);
    if (!buttonElement || !containerElement) {
      console.warn('验证码元素未找到，延迟初始化');
      return;
    }

    initAttemptedRef.current = true;

    try {
      await loadCaptchaScript();

      if (!window.initAliyunCaptcha) {
        throw new Error('验证码脚本加载异常');
      }

      const buttonSelector = `#${buttonIdRef.current}`;
      const containerSelector = `#${captchaContainerIdRef.current}`;

      // 初始化无痕验证码
      // element: 滑块验证弹窗的容器
      // button: 触发验证的按钮
      window.initAliyunCaptcha({
        SceneId: config.sceneId,
        prefix: config.prefix,
        mode: 'popup',
        element: containerSelector,
        button: buttonSelector,
        captchaVerifyCallback: async (captchaVerifyParam) => {
          // 执行业务回调
          if (onSuccessRef.current) {
            try {
              const result = await onSuccessRef.current(captchaVerifyParam);
              // 如果返回对象包含 captchaResult: false，表示验证码验证失败，需要弹出滑块
              if (result && typeof result === 'object' && result.captchaResult === false) {
                return {
                  captchaResult: false
                };
              }
              return {
                captchaResult: true,
                bizResult: result !== false && !(result && result.bizResult === false)
              };
            } catch (err) {
              // 检查是否是验证码验证失败
              if (err.captchaFailed) {
                return {
                  captchaResult: false
                };
              }
              return {
                captchaResult: true,
                bizResult: false
              };
            }
          }
          return {
            captchaResult: true,
            bizResult: true
          };
        },
        onBizResultCallback: (bizResult) => {
          // 业务验证结果回调
        },
        getInstance: (instance) => {
          captchaInstanceRef.current = instance;
        },
        slideStyle: {
          width: 320,
          height: 40
        },
        language: 'cn',
        region: config.region || 'cn'
      });

      setCaptchaLoading(false);
    } catch (err) {
      console.error('初始化验证码失败:', err);
      setError(err.message);
      setCaptchaLoading(false);
      initAttemptedRef.current = false; // 允许重试
      if (onError) {
        onError(err);
      }
    }
  }, [config, buttonMounted, onError]);

  // 当配置和按钮都准备好时初始化验证码
  useEffect(() => {
    if (config && buttonMounted && !initAttemptedRef.current) {
      // 延迟一帧确保DOM完全渲染
      requestAnimationFrame(() => {
        initCaptcha();
      });
    }
  }, [config, buttonMounted, initCaptcha]);

  // 暴露刷新方法给父组件
  useImperativeHandle(ref, () => ({
    refresh: () => {
      if (captchaInstanceRef.current) {
        try {
          captchaInstanceRef.current.refresh();
        } catch (e) {
          // ignore
        }
      }
    }
  }), []);

  // 验证码跳过模式（未配置验证码）
  const handleSkipClick = () => {
    if (onSuccessRef.current) {
      onSuccessRef.current('SKIP');
    }
  };

  const buttonClassName = `btn btn-${type} ${className}`;
  // 按钮在验证码未就绪时禁用
  const isDisabled = disabled || loading || (captchaLoading && error !== 'SKIP');

  // 容器样式
  const containerStyle = {
    position: 'relative',
    width: style.width || 'auto',
    display: style.width === '100%' ? 'block' : 'inline-block'
  };

  // 验证码未配置，渲染普通按钮
  if (error === 'SKIP') {
    return (
      <div style={containerStyle}>
        <button
          type="button"
          className={buttonClassName}
          style={style}
          disabled={disabled || loading}
          onClick={handleSkipClick}
        >
          {loading ? loadingText : buttonText}
        </button>
      </div>
    );
  }

  // 加载出错（非SKIP）
  if (error && error !== 'SKIP') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...style }}>
        <span style={{ color: '#e74c3c', fontSize: '0.9rem' }}>{error}</span>
        <button
          type="button"
          onClick={() => {
            initAttemptedRef.current = false;
            setError(null);
            setCaptchaLoading(true);
            initCaptcha();
          }}
          className="btn btn-secondary"
          style={{ padding: '4px 12px', fontSize: '0.85rem' }}
        >
          重试
        </button>
      </div>
    );
  }

  // 始终渲染有ID的按钮，验证码会绑定到这个按钮
  // 按钮在验证码未就绪时显示"加载中..."并禁用
  // 容器用于承载滑块验证弹窗（无痕验证失败时自动弹出）
  return (
    <div style={containerStyle}>
      <button
        ref={buttonRef}
        id={buttonIdRef.current}
        type="button"
        className={buttonClassName}
        style={style}
        disabled={isDisabled}
      >
        {loading ? loadingText : (captchaLoading ? '加载中...' : buttonText)}
      </button>
      {/* 验证码弹窗容器 */}
      <div id={captchaContainerIdRef.current} />
    </div>
  );
});

AliyunCaptcha.displayName = 'AliyunCaptcha';

export default AliyunCaptcha;
