import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SITE_SETTINGS_DEFAULTS } from '../constants/siteTheme';
import { settingsService } from '../services';

const SiteSettingsContext = createContext({
  siteSettings: SITE_SETTINGS_DEFAULTS,
  loading: true,
  refreshSiteSettings: async () => {},
  setSiteSettings: () => {}
});

const normalizeHexColor = (color) => {
  if (typeof color !== 'string') {
    return null;
  }

  const trimmedColor = color.trim();
  const shortHexMatch = /^#([0-9a-f]{3})$/i.exec(trimmedColor);

  if (shortHexMatch) {
    return `#${shortHexMatch[1].split('').map((char) => `${char}${char}`).join('')}`;
  }

  if (/^#([0-9a-f]{6})$/i.test(trimmedColor)) {
    return trimmedColor;
  }

  return null;
};

const hexToRgba = (color, alpha) => {
  const normalizedColor = normalizeHexColor(color);

  if (!normalizedColor) {
    return color;
  }

  const red = parseInt(normalizedColor.slice(1, 3), 16);
  const green = parseInt(normalizedColor.slice(3, 5), 16);
  const blue = parseInt(normalizedColor.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const applyThemeSettings = (siteSettings) => {
  const root = document.documentElement;
  const body = document.body;
  const bodyBackground = `linear-gradient(135deg, ${siteSettings.backgroundColor} 0%, ${siteSettings.backgroundAccentColor} 100%)`;

  root.style.setProperty('--primary-purple', siteSettings.primaryColor);
  root.style.setProperty('--light-purple', siteSettings.lightColor);
  root.style.setProperty('--dark-purple', siteSettings.darkColor);
  root.style.setProperty('--bg-light', siteSettings.backgroundColor);
  root.style.setProperty('--bg-purple-light', siteSettings.backgroundAccentColor);
  root.style.setProperty('--text-dark', siteSettings.textDarkColor);
  root.style.setProperty('--text-light', siteSettings.textLightColor);
  root.style.setProperty('--success-color', siteSettings.successColor);
  root.style.setProperty('--warning-color', siteSettings.warningColor);
  root.style.setProperty('--danger-color', siteSettings.dangerColor);
  root.style.setProperty('--theme-border-soft', siteSettings.borderSoftColor);
  root.style.setProperty('--theme-surface-subtle', siteSettings.surfaceSubtleColor);
  root.style.setProperty('--theme-surface-muted', siteSettings.surfaceMutedColor);
  root.style.setProperty('--theme-nav-surface', siteSettings.surfaceSubtleColor);
  root.style.setProperty('--theme-nav-surface-mobile', siteSettings.surfaceSubtleColor);
  root.style.setProperty('--theme-card-surface', siteSettings.surfaceSubtleColor);
  root.style.setProperty('--theme-card-surface-alt', siteSettings.surfaceMutedColor);
  root.style.setProperty('--theme-card-highlight', hexToRgba(siteSettings.lightColor, 0.08));
  root.style.setProperty('--theme-primary-soft', hexToRgba(siteSettings.primaryColor, 0.10));
  root.style.setProperty('--theme-primary-soft-strong', hexToRgba(siteSettings.primaryColor, 0.18));
  root.style.setProperty('--theme-success-surface', hexToRgba(siteSettings.successColor, 0.12));
  root.style.setProperty('--theme-warning-surface', hexToRgba(siteSettings.warningColor, 0.14));
  root.style.setProperty('--theme-danger-surface', hexToRgba(siteSettings.dangerColor, 0.12));
  root.style.setProperty('--theme-glass-surface', hexToRgba(siteSettings.darkColor, 0.68));
  root.style.setProperty('--theme-glass-border', hexToRgba(siteSettings.lightColor, 0.14));
  root.style.setProperty('--theme-overlay', hexToRgba(siteSettings.darkColor, 0.78));
  root.style.setProperty('--theme-input-surface', siteSettings.surfaceMutedColor);
  root.style.setProperty('--theme-tag-default', siteSettings.primaryColor);
  root.style.setProperty('--theme-tag-text', '#ffffff');
  root.style.setProperty('--theme-time-badge-bg', hexToRgba(siteSettings.primaryColor, 0.16));
  root.style.setProperty('--theme-time-badge-text', siteSettings.darkColor);
  root.style.setProperty('--theme-link-color', siteSettings.primaryColor);
  root.style.setProperty('--theme-hero-ring', hexToRgba(siteSettings.primaryColor, 0.32));
  root.style.setProperty('--theme-note-start', siteSettings.dangerColor);
  root.style.setProperty('--theme-note-end', siteSettings.primaryColor);
  root.style.setProperty('--shadow', `0 4px 10px ${hexToRgba(siteSettings.primaryColor, 0.12)}`);
  root.style.setProperty('--shadow-hover', `0 10px 24px ${hexToRgba(siteSettings.primaryColor, 0.22)}`);
  root.style.setProperty('--theme-shadow-hover', hexToRgba(siteSettings.primaryColor, 0.24));
  root.style.setProperty('--theme-focus-ring', hexToRgba(siteSettings.primaryColor, 0.18));
  root.style.setProperty('--theme-modal-shadow', hexToRgba(siteSettings.darkColor, 0.28));
  root.style.colorScheme = 'light';

  if (body) {
    body.style.background = bodyBackground;
    body.style.backgroundAttachment = 'fixed';
    body.style.color = siteSettings.textDarkColor;
  }
};

const applyMetadata = (siteSettings) => {
  document.title = siteSettings.siteTitle;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', siteSettings.primaryColor);
  }

  document.querySelectorAll('link[rel*="icon"]').forEach((linkElement) => {
    linkElement.setAttribute('href', siteSettings.faviconUrl);
  });
};

export const buildPageTitle = (siteTitle, pageTitle) => {
  if (!pageTitle) {
    return siteTitle;
  }

  return `${pageTitle} - ${siteTitle}`;
};

export function SiteSettingsProvider({ children }) {
  const [siteSettings, setSiteSettings] = useState(SITE_SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);

  const refreshSiteSettings = useCallback(async () => {
    try {
      const config = await settingsService.getSiteConfig();
      setSiteSettings({ ...SITE_SETTINGS_DEFAULTS, ...config });
    } catch (error) {
      console.error('Failed to load site settings:', error);
      setSiteSettings(SITE_SETTINGS_DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSiteSettings();
  }, [refreshSiteSettings]);

  useEffect(() => {
    applyThemeSettings(siteSettings);
    if (!loading) {
      applyMetadata(siteSettings);
    }
  }, [siteSettings, loading]);

  const value = useMemo(() => ({
    siteSettings,
    loading,
    refreshSiteSettings,
    setSiteSettings
  }), [siteSettings, loading, refreshSiteSettings]);

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export const useSiteSettings = () => useContext(SiteSettingsContext);

export const usePageTitle = (pageTitle) => {
  const { siteSettings, loading } = useSiteSettings();

  useEffect(() => {
    if (!loading) {
      document.title = buildPageTitle(siteSettings.siteTitle, pageTitle);
    }
  }, [pageTitle, siteSettings.siteTitle, loading]);
};
