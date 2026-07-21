const { getUserInfo } = require('../utils/bilibiliApi');
const { resolveSiteConfig } = require('./settingsController');

exports.getBilibiliInfo = async (req, res) => {
  try {
    const config = await resolveSiteConfig();
    const uid = String(config.bilibiliUid || '').trim();
    if (!uid) return res.json({ configured: false });
    const profile = await getUserInfo(uid);
    if (!profile) return res.json({ configured: true, available: false, mid: uid });
    return res.json({ configured: true, available: true, ...profile });
  } catch (error) {
    console.error('Bilibili profile lookup failed:', error.message);
    return res.json({ configured: true, available: false });
  }
};
