const SITE_PLAYLIST_SETTING_KEY = 'site_playlist_id';
const DEFAULT_SITE_PLAYLIST_TITLE = '网站歌单';

async function ensureSitePlaylist(connection, createdBy = null) {
  await connection.query(
    'INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)',
    [SITE_PLAYLIST_SETTING_KEY, '']
  );

  const [settingRows] = await connection.query(
    'SELECT setting_value FROM settings WHERE setting_key = ? FOR UPDATE',
    [SITE_PLAYLIST_SETTING_KEY]
  );
  const configuredId = Number.parseInt(settingRows[0]?.setting_value, 10);

  if (Number.isInteger(configuredId) && configuredId > 0) {
    const [configuredPlaylists] = await connection.query(
      'SELECT id FROM playlists WHERE id = ? LIMIT 1',
      [configuredId]
    );
    if (configuredPlaylists.length) return configuredPlaylists[0].id;
  }

  const [existingPlaylists] = await connection.query(
    'SELECT id FROM playlists ORDER BY created_at DESC, id DESC LIMIT 1'
  );
  let playlistId = existingPlaylists[0]?.id;

  if (!playlistId) {
    const [titleRows] = await connection.query(
      'SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1',
      ['playlist_title']
    );
    const configuredTitle = String(titleRows[0]?.setting_value || '').trim();
    const [result] = await connection.query(
      'INSERT INTO playlists (title, description, created_by) VALUES (?, ?, ?)',
      [configuredTitle || DEFAULT_SITE_PLAYLIST_TITLE, '网站唯一歌曲列表', createdBy]
    );
    playlistId = result.insertId;
  }

  await connection.query(
    'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
    [String(playlistId), SITE_PLAYLIST_SETTING_KEY]
  );
  return playlistId;
}

module.exports = {
  SITE_PLAYLIST_SETTING_KEY,
  DEFAULT_SITE_PLAYLIST_TITLE,
  ensureSitePlaylist
};
