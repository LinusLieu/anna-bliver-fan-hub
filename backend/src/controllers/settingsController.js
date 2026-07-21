const db = require('../config/database');

const SITE_FIELDS = {
  siteTitle: ['site_title', 'SITE_TITLE', '小猪anna的秘密基地'],
  navbarLogoUrl: ['navbar_logo_url', 'SITE_LOGO_URL', '/annapiggy-logo.png'],
  faviconUrl: ['favicon_url', 'SITE_FAVICON_URL', '/favicon.ico'],
  creatorDisplayName: ['creator_display_name', 'CREATOR_DISPLAY_NAME', '小猪anna'],
  bilibiliUid: ['bilibili_uid', 'BILIBILI_UID', ''],
  homeTitle: ['home_title', 'SITE_HOME_TITLE', '欢迎来到小猪anna的秘密基地'],
  homeSubtitle: ['home_subtitle', 'SITE_HOME_SUBTITLE', '音乐、心意与每一份支持，都值得被认真收藏。'],
  playlistCardTitle: ['playlist_card_title', 'SITE_PLAYLIST_CARD_TITLE', '网页歌单'],
  playlistCardDescription: ['playlist_card_description', 'SITE_PLAYLIST_CARD_DESCRIPTION', '浏览曲目、标签与演唱信息。'],
  marshmallowCardTitle: ['marshmallow_card_title', 'SITE_MARSHMALLOW_CARD_TITLE', '棉花糖'],
  marshmallowCardDescription: ['marshmallow_card_description', 'SITE_MARSHMALLOW_CARD_DESCRIPTION', '匿名送达想说的话，登录后还能查看回复。'],
  prizeCardTitle: ['prize_card_title', 'SITE_PRIZE_CARD_TITLE', '积分商城'],
  prizeCardDescription: ['prize_card_description', 'SITE_PRIZE_CARD_DESCRIPTION', '使用社区积分兑换限定奖品。'],
  playlistTitle: ['playlist_title', 'SITE_PLAYLIST_TITLE', '小猪anna的歌单'],
  playlistSubtitle: ['playlist_subtitle', 'SITE_PLAYLIST_SUBTITLE', '想听什么，就从这里开始。'],
  marshmallowTitle: ['marshmallow_title', 'SITE_MARSHMALLOW_TITLE', '棉花糖'],
  marshmallowSubtitle: ['marshmallow_subtitle', 'SITE_MARSHMALLOW_SUBTITLE', '写下一封匿名来信。'],
  icpText: ['icp_text', 'SITE_ICP_TEXT', ''],
  publicSecurityText: ['public_security_text', 'SITE_PUBLIC_SECURITY_TEXT', ''],
  primaryColor: ['theme_primary_color', 'SITE_PRIMARY_COLOR', '#9b59b6'],
  lightColor: ['theme_light_color', 'SITE_LIGHT_COLOR', '#b98ba0'],
  darkColor: ['theme_dark_color', 'SITE_DARK_COLOR', '#2b2028'],
  backgroundColor: ['theme_background_color', 'SITE_BACKGROUND_COLOR', '#f7f4f6'],
  backgroundAccentColor: ['theme_background_accent_color', 'SITE_BACKGROUND_ACCENT_COLOR', '#eaf1ef'],
  textDarkColor: ['theme_text_dark_color', 'SITE_TEXT_DARK_COLOR', '#2b272a'],
  textLightColor: ['theme_text_light_color', 'SITE_TEXT_LIGHT_COLOR', '#6f676c'],
  borderSoftColor: ['theme_border_soft_color', 'SITE_BORDER_COLOR', '#d9d2d6'],
  surfaceSubtleColor: ['theme_surface_subtle_color', 'SITE_SURFACE_COLOR', '#ffffff'],
  surfaceMutedColor: ['theme_surface_muted_color', 'SITE_SURFACE_MUTED_COLOR', '#f0ecef'],
  successColor: ['theme_success_color', 'SITE_SUCCESS_COLOR', '#27785d'],
  warningColor: ['theme_warning_color', 'SITE_WARNING_COLOR', '#9a671f'],
  dangerColor: ['theme_danger_color', 'SITE_DANGER_COLOR', '#b83a4f']
};

const COLOR_FIELDS = new Set(Object.keys(SITE_FIELDS).filter((key) => key.endsWith('Color')));
const MAX_VALUE_LENGTH = 500;

function resolveConfig(storedRows = [], env = process.env) {
  const stored = new Map(storedRows.map((row) => [row.setting_key, row.setting_value]));
  return Object.fromEntries(Object.entries(SITE_FIELDS).map(([field, [key, envName, fallback]]) => [
    field,
    stored.has(key) ? stored.get(key) : (env[envName] ?? fallback)
  ]));
}

async function getSiteConfig() {
  const keys = Object.values(SITE_FIELDS).map(([key]) => key);
  const [rows] = await db.query(`SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${keys.map(() => '?').join(',')})`, keys);
  return resolveConfig(rows);
}

function normalizeValue(field, value) {
  const text = String(value ?? '').trim();
  if (text.length > MAX_VALUE_LENGTH) throw new Error(`${field} is too long`);
  if (field === 'bilibiliUid' && text && !/^\d{1,20}$/.test(text)) throw new Error('bilibiliUid must be numeric');
  if (COLOR_FIELDS.has(field) && !/^#[0-9a-f]{6}$/i.test(text)) throw new Error(`${field} must be a six-digit hex color`);
  if (['navbarLogoUrl', 'faviconUrl'].includes(field) && text && !/^(\/|https:\/\/)/i.test(text)) throw new Error(`${field} must use HTTPS or a site-relative path`);
  return text;
}

exports.getCaptchaConfig = (req, res) => res.json({
  enabled: Boolean(process.env.ALIYUN_CAPTCHA_SCENE_ID && process.env.ALIYUN_CAPTCHA_PREFIX),
  sceneId: process.env.ALIYUN_CAPTCHA_SCENE_ID || '', prefix: process.env.ALIYUN_CAPTCHA_PREFIX || '', region: 'cn'
});
exports.getRegistrationStatus = async (req, res) => {
  const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['registration_open']);
  res.json({ registrationOpen: rows.length ? rows[0].setting_value === 'true' : true });
};
exports.updateRegistrationStatus = async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Access denied' });
  const value = String(Boolean(req.body.isOpen));
  await db.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', ['registration_open', value]);
  return res.json({ registrationOpen: value === 'true' });
};
exports.getSiteConfig = async (req, res) => res.json(await getSiteConfig());
exports.updateSiteConfig = async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Access denied' });
  try {
    const entries = Object.entries(req.body || {}).filter(([field]) => SITE_FIELDS[field]);
    if (!entries.length) return res.status(400).json({ message: 'No site configuration provided' });
    for (const [field, value] of entries) {
      await db.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [SITE_FIELDS[field][0], normalizeValue(field, value)]);
    }
    return res.json({ message: 'Site configuration updated', config: await getSiteConfig() });
  } catch (error) { return res.status(400).json({ message: error.message }); }
};

exports.resolveSiteConfig = getSiteConfig;
exports.__test__ = { SITE_FIELDS, normalizeValue, resolveConfig };
