import React, { useEffect, useState } from 'react';
import {
  SITE_SETTINGS_DEFAULTS,
  SITE_THEME_COLOR_SECTIONS,
  SITE_THEME_PRESETS
} from '../../constants/siteTheme';
import { usePageTitle, useSiteSettings } from '../../context/SiteSettingsContext';
import { settingsService } from '../../services';
import './SiteConfig.css';

const DEFAULT_FORM = SITE_SETTINGS_DEFAULTS;

const PREVIEW_STATUS_ITEMS = [
  { key: 'successColor', label: '成功' },
  { key: 'warningColor', label: '警告' },
  { key: 'dangerColor', label: '危险' }
];

const isPresetActive = (formData, preset) => Object.entries(preset.values)
  .every(([fieldName, value]) => formData[fieldName] === value);

function SiteConfig() {
  const { siteSettings, setSiteSettings, refreshSiteSettings } = useSiteSettings();
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  usePageTitle('网站配置');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const config = await settingsService.getSiteConfig();
        setFormData({ ...DEFAULT_FORM, ...config });
      } catch (loadError) {
        console.error('Failed to load site config:', loadError);
        setError('加载网站配置失败');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    if (!loading) {
      setFormData({ ...DEFAULT_FORM, ...siteSettings });
    }
  }, [siteSettings, loading]);

  const handleChange = (fieldName, value) => {
    setFormData((previous) => ({
      ...previous,
      [fieldName]: value
    }));
  };

  const handleBulkChange = (updates) => {
    setFormData((previous) => ({
      ...previous,
      ...updates
    }));
    setError('');
    setSuccessMessage('');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccessMessage('');

      const response = await settingsService.updateSiteConfig(formData);
      if (response.config) {
        setSiteSettings(response.config);
      }
      await refreshSiteSettings();
      setSuccessMessage('网站配置已保存');
    } catch (saveError) {
      console.error('Failed to save site config:', saveError);
      setError(saveError.response?.data?.message || '保存网站配置失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="site-config-page"><div className="loading">加载网站配置中...</div></div>;
  }

  return (
    <div className="site-config-page">
      <div className="site-config-header">
        <div>
          <h1>网站配置</h1>
          <p>管理网站品牌信息、歌单头图文案、基础主题色和状态色，并支持预设色卡一键套用。</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="site-config-grid">
        <section className="site-config-card site-config-card-full">
          <div className="site-config-card-heading">
            <div>
              <h2>预设色卡</h2>
              <p>点击任意色卡即可把整套主题、状态色与界面基础色快速填入表单。</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleBulkChange(SITE_THEME_PRESETS[0].values)}
            >
              恢复默认配色
            </button>
          </div>

          <div className="site-config-preset-grid">
            {SITE_THEME_PRESETS.map((preset) => {
              const active = isPresetActive(formData, preset);

              return (
                <button
                  key={preset.key}
                  type="button"
                  className={`site-config-preset ${active ? 'active' : ''}`}
                  onClick={() => handleBulkChange(preset.values)}
                >
                  <div className="site-config-preset-swatches" aria-hidden="true">
                    {preset.swatches.map((swatchColor) => (
                      <span
                        key={`${preset.key}-${swatchColor}`}
                        className="site-config-preset-swatch"
                        style={{ backgroundColor: swatchColor }}
                      />
                    ))}
                  </div>
                  <div className="site-config-preset-copy">
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                    {active && <em>当前已应用</em>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="site-config-card">
          <h2>基础信息</h2>

          <label className="site-config-field">
            <span>网站标题</span>
            <input type="text" value={formData.siteTitle} onChange={(e) => handleChange('siteTitle', e.target.value)} />
          </label>

          <label className="site-config-field">
            <span>网站 Favicon</span>
            <input type="text" value={formData.faviconUrl} onChange={(e) => handleChange('faviconUrl', e.target.value)} />
          </label>

          <label className="site-config-field">
            <span>B站 UP UID</span>
            <input type="text" value={formData.bilibiliUid} onChange={(e) => handleChange('bilibiliUid', e.target.value)} />
          </label>

          <label className="site-config-field">
            <span>创作者称呼</span>
            <input type="text" value={formData.creatorDisplayName} onChange={(e) => handleChange('creatorDisplayName', e.target.value)} />
          </label>

          <label className="site-config-field">
            <span>导航 Logo</span>
            <input type="text" value={formData.navbarLogoUrl} onChange={(e) => handleChange('navbarLogoUrl', e.target.value)} />
          </label>
        </section>

        <section className="site-config-card">
          <h2>首页文案</h2>

          <label className="site-config-field">
            <span>欢迎标题</span>
            <input type="text" value={formData.homeTitle} onChange={(e) => handleChange('homeTitle', e.target.value)} />
          </label>

          <label className="site-config-field">
            <span>欢迎副标题</span>
            <textarea rows="3" value={formData.homeSubtitle} onChange={(e) => handleChange('homeSubtitle', e.target.value)} />
          </label>

          <label className="site-config-field"><span>歌单卡片标题</span><input type="text" value={formData.playlistCardTitle} onChange={(e) => handleChange('playlistCardTitle', e.target.value)} /></label>
          <label className="site-config-field"><span>歌单卡片说明</span><input type="text" value={formData.playlistCardDescription} onChange={(e) => handleChange('playlistCardDescription', e.target.value)} /></label>
          <label className="site-config-field"><span>棉花糖卡片标题</span><input type="text" value={formData.marshmallowCardTitle} onChange={(e) => handleChange('marshmallowCardTitle', e.target.value)} /></label>
          <label className="site-config-field"><span>棉花糖卡片说明</span><input type="text" value={formData.marshmallowCardDescription} onChange={(e) => handleChange('marshmallowCardDescription', e.target.value)} /></label>
          <label className="site-config-field"><span>商城卡片标题</span><input type="text" value={formData.prizeCardTitle} onChange={(e) => handleChange('prizeCardTitle', e.target.value)} /></label>
          <label className="site-config-field"><span>商城卡片说明</span><input type="text" value={formData.prizeCardDescription} onChange={(e) => handleChange('prizeCardDescription', e.target.value)} /></label>
        </section>

        <section className="site-config-card">
          <h2>功能文案</h2>

          <label className="site-config-field">
            <span>歌单标题</span>
            <input type="text" value={formData.playlistTitle} onChange={(e) => handleChange('playlistTitle', e.target.value)} />
          </label>

          <label className="site-config-field">
            <span>歌单副标题</span>
            <textarea rows="4" value={formData.playlistSubtitle} onChange={(e) => handleChange('playlistSubtitle', e.target.value)} />
          </label>

          <label className="site-config-field"><span>棉花糖标题</span><input type="text" value={formData.marshmallowTitle} onChange={(e) => handleChange('marshmallowTitle', e.target.value)} /></label>
          <label className="site-config-field"><span>棉花糖副标题</span><textarea rows="3" value={formData.marshmallowSubtitle} onChange={(e) => handleChange('marshmallowSubtitle', e.target.value)} /></label>

          <label className="site-config-field">
            <span>ICP备案信息</span>
            <input type="text" value={formData.icpText} onChange={(e) => handleChange('icpText', e.target.value)} />
          </label>

          <label className="site-config-field">
            <span>公安备案信息</span>
            <input type="text" value={formData.publicSecurityText} onChange={(e) => handleChange('publicSecurityText', e.target.value)} />
          </label>
        </section>

        <section className="site-config-card site-config-card-full">
          <h2>主题配色</h2>

          {SITE_THEME_COLOR_SECTIONS.map((section) => (
            <div key={section.title} className="site-config-section-group">
              <div className="site-config-section-heading">
                <h3>{section.title}</h3>
                <p>{section.description}</p>
              </div>

              <div className="site-config-color-grid">
                {section.fields.map((field) => (
                  <label key={field.name} className="site-config-field site-config-color-field">
                    <span>{field.label}</span>
                    <div className="site-config-color-input">
                      <input
                        type="color"
                        value={formData[field.name]}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                      />
                      <input
                        type="text"
                        value={formData[field.name]}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="site-config-preview" style={{
            background: `linear-gradient(135deg, ${formData.backgroundColor} 0%, ${formData.backgroundAccentColor} 100%)`
          }}>
            <div
              className="site-config-preview-navbar"
              style={{
                background: `linear-gradient(135deg, ${formData.darkColor} 0%, ${formData.backgroundAccentColor} 100%)`,
                border: `1px solid ${formData.borderSoftColor}`
              }}
            >
              <div className="site-config-preview-navbar-brand">
                <div className="site-config-preview-logo" style={{ backgroundColor: formData.primaryColor }} />
                <strong style={{ color: formData.lightColor }}>{formData.siteTitle}</strong>
              </div>
              <span style={{ color: formData.textLightColor }}>网站配置</span>
            </div>

            <div
              className="site-config-preview-card"
              style={{
                background: formData.surfaceSubtleColor,
                border: `1px solid ${formData.borderSoftColor}`
              }}
            >
              <div
                className="site-config-preview-avatar"
                style={{
                  borderColor: formData.primaryColor,
                  background: `linear-gradient(135deg, ${formData.lightColor} 0%, ${formData.surfaceMutedColor} 100%)`
                }}
              />
              <div className="site-config-preview-copy">
                <strong style={{ color: formData.primaryColor }}>{formData.playlistTitle}</strong>
                <p style={{ color: formData.textLightColor }}>{formData.playlistSubtitle}</p>
              </div>
            </div>

            <div className="site-config-preview-panels">
              <div
                className="site-config-preview-panel"
                style={{
                  background: formData.surfaceSubtleColor,
                  border: `1px solid ${formData.borderSoftColor}`
                }}
              >
                <strong style={{ color: formData.textDarkColor }}>界面基础</strong>
                <span style={{ color: formData.textLightColor }}>输入框、表格和卡片边框会使用这组颜色。</span>
              </div>
              <div
                className="site-config-preview-panel"
                style={{
                  background: formData.surfaceMutedColor,
                  border: `1px solid ${formData.borderSoftColor}`
                }}
              >
                <strong style={{ color: formData.textDarkColor }}>层次对比</strong>
                <span style={{ color: formData.textLightColor }}>弱表面色更适合筛选条、提示块与次级区域。</span>
              </div>
            </div>

            <div className="site-config-preview-statuses">
              {PREVIEW_STATUS_ITEMS.map((item) => (
                <span
                  key={item.key}
                  className="site-config-status-chip"
                  style={{ backgroundColor: formData[item.key] }}
                >
                  {item.label}
                </span>
              ))}
            </div>

            <div className="site-config-preview-records">
              <span>{formData.icpText || '未填写 ICP 备案文案'}</span>
              <span>{formData.publicSecurityText || '未填写公安备案文案'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SiteConfig;
