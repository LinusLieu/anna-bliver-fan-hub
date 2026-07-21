const db = require('../config/database');
const { ensureSitePlaylist } = require('../services/sitePlaylistService');
const { positiveInt, stringValue } = require('../utils/validation');

const DEFAULT_TAG_COLOR = '#6c5ce7';
const SPONSOR_TAG_NAME = '冠名';

async function runInTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeSongInput(song = {}) {
  return {
    title: stringValue(song.title, { field: 'Title', max: 255 }),
    artist: stringValue(song.artist, { field: 'Artist', max: 255 }),
    duration: stringValue(song.duration, { field: 'Duration', max: 20 }) || null,
    note: stringValue(song.note, { field: 'Sponsor note', max: 2000 }) || null,
    songOrder: Number.isFinite(Number(song.song_order)) ? Number(song.song_order) : 0,
    tags: Array.isArray(song.tags) ? song.tags : []
  };
}

function normalizeTagNames(tags, note) {
  const names = (Array.isArray(tags) ? tags : [])
    .map((tag) => typeof tag === 'string' ? tag : tag?.name)
    .map((name) => stringValue(name, { field: 'Tag name', max: 50 }))
    .filter((name) => name && name !== SPONSOR_TAG_NAME);
  if (note) names.push(SPONSOR_TAG_NAME);
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length > 30) {
    const error = new Error('A song can contain at most 30 tags');
    error.status = 400;
    throw error;
  }
  return uniqueNames;
}

async function replaceSongTags(connection, songId, tags, note) {
  const tagNames = normalizeTagNames(tags, note);
  await connection.query('DELETE FROM song_tags WHERE song_id = ?', [songId]);
  if (!tagNames.length) return;

  for (const name of tagNames) {
    await connection.query(
      'INSERT IGNORE INTO tags (name, color) VALUES (?, ?)',
      [name, DEFAULT_TAG_COLOR]
    );
  }
  const [tagRows] = await connection.query(
    'SELECT id FROM tags WHERE name IN (?)',
    [tagNames]
  );
  for (const tag of tagRows) {
    await connection.query(
      'INSERT IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)',
      [songId, tag.id]
    );
  }
}

async function getCurrentSongTags(connection, songId) {
  const [rows] = await connection.query(
    `SELECT t.name
     FROM tags t
     INNER JOIN song_tags st ON st.tag_id = t.id
     WHERE st.song_id = ?`,
    [songId]
  );
  return rows.map((row) => row.name);
}

async function insertSong(connection, playlistId, input) {
  const [result] = await connection.query(
    `INSERT INTO songs (playlist_id, title, artist, duration, song_order, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [playlistId, input.title, input.artist, input.duration, input.songOrder, input.note]
  );
  await replaceSongTags(connection, result.insertId, input.tags, input.note);
  return result.insertId;
}

async function loadSongs(queryable, whereClause = '', params = []) {
  const [rows] = await queryable.query(
    `SELECT s.id, s.playlist_id, s.title, s.artist, s.duration, s.note, s.song_order,
            s.created_at, p.title AS playlist_title,
            t.id AS tag_id, t.name AS tag_name, t.color AS tag_color
     FROM songs s
     INNER JOIN playlists p ON p.id = s.playlist_id
     LEFT JOIN song_tags st ON st.song_id = s.id
     LEFT JOIN tags t ON t.id = st.tag_id
     ${whereClause}
     ORDER BY s.title ASC, s.id ASC, t.id ASC`,
    params
  );

  const songsById = new Map();
  for (const row of rows) {
    if (!songsById.has(row.id)) {
      songsById.set(row.id, {
        id: row.id,
        playlist_id: row.playlist_id,
        title: row.title,
        artist: row.artist,
        duration: row.duration,
        note: row.note,
        song_order: row.song_order,
        created_at: row.created_at,
        playlistTitle: row.playlist_title,
        tags: []
      });
    }
    if (row.tag_id) {
      songsById.get(row.id).tags.push({
        id: row.tag_id,
        name: row.tag_name,
        color: row.tag_color
      });
    }
  }
  return [...songsById.values()];
}

function sendControllerError(res, error, label) {
  console.error(`${label} error:`, error);
  const status = error.statusCode || error.status || 500;
  return res.status(status).json({
    message: status < 500 ? error.message : 'Server error'
  });
}

exports.getAllPlaylists = async (req, res) => {
  try {
    const [playlists] = await db.query(
      'SELECT p.*, u.username as creator_name FROM playlists p LEFT JOIN users u ON p.created_by = u.id ORDER BY p.created_at DESC'
    );
    res.json(playlists);
  } catch (error) {
    sendControllerError(res, error, 'Get playlists');
  }
};

exports.getAllSongs = async (req, res) => {
  try {
    res.json(await loadSongs(db));
  } catch (error) {
    sendControllerError(res, error, 'Get songs');
  }
};

exports.getPlaylistById = async (req, res) => {
  try {
    const playlistId = positiveInt(req.params.id, { field: 'Playlist ID' });
    const [playlists] = await db.query(
      'SELECT p.*, u.username as creator_name FROM playlists p LEFT JOIN users u ON p.created_by = u.id WHERE p.id = ?',
      [playlistId]
    );
    if (!playlists.length) return res.status(404).json({ message: 'Playlist not found' });
    const songs = await loadSongs(db, 'WHERE s.playlist_id = ?', [playlistId]);
    return res.json({ ...playlists[0], songs });
  } catch (error) {
    return sendControllerError(res, error, 'Get playlist');
  }
};

exports.addSong = async (req, res) => {
  const input = normalizeSongInput(req.body);
  if (!input.title || !input.artist) {
    return res.status(400).json({ message: 'Title and artist are required' });
  }

  try {
    const result = await runInTransaction(async (connection) => {
      const playlistId = await ensureSitePlaylist(connection, req.userId);
      const songId = await insertSong(connection, playlistId, input);
      return { playlistId, songId };
    });
    return res.status(201).json({ message: 'Song added successfully', ...result });
  } catch (error) {
    return sendControllerError(res, error, 'Add song');
  }
};

exports.batchAddSongs = async (req, res) => {
  if (!Array.isArray(req.body.songs)) {
    return res.status(400).json({ message: 'Songs must be an array' });
  }
  if (req.body.songs.length > 500) return res.status(400).json({ message: 'A batch can contain at most 500 songs' });
  const songs = req.body.songs.map(normalizeSongInput).filter((song) => song.title && song.artist);
  if (!songs.length) {
    return res.status(400).json({ message: 'At least one valid song is required' });
  }

  try {
    const result = await runInTransaction(async (connection) => {
      const playlistId = await ensureSitePlaylist(connection, req.userId);
      for (const song of songs) await insertSong(connection, playlistId, song);
      return { playlistId, count: songs.length };
    });
    return res.status(201).json({ message: `Successfully added ${result.count} songs`, ...result });
  } catch (error) {
    return sendControllerError(res, error, 'Batch add songs');
  }
};

exports.updateSong = async (req, res) => {
  const input = normalizeSongInput(req.body);
  const songId = positiveInt(req.params.id, { field: 'Song ID' });
  if (!input.title || !input.artist) {
    return res.status(400).json({ message: 'Title and artist are required' });
  }

  try {
    await runInTransaction(async (connection) => {
      const [songs] = await connection.query('SELECT id FROM songs WHERE id = ? FOR UPDATE', [songId]);
      if (!songs.length) {
        const error = new Error('Song not found');
        error.statusCode = 404;
        throw error;
      }
      if (!Array.isArray(req.body.tags)) input.tags = await getCurrentSongTags(connection, songId);
      await connection.query(
        'UPDATE songs SET title = ?, artist = ?, duration = ?, note = ? WHERE id = ?',
        [input.title, input.artist, input.duration, input.note, songId]
      );
      await replaceSongTags(connection, songId, input.tags, input.note);
    });
    return res.json({ message: 'Song updated successfully' });
  } catch (error) {
    return sendControllerError(res, error, 'Update song');
  }
};

exports.deleteSong = async (req, res) => {
  try {
    const songId = positiveInt(req.params.id, { field: 'Song ID' });
    await runInTransaction(async (connection) => {
      const [result] = await connection.query('DELETE FROM songs WHERE id = ?', [songId]);
      if (!result.affectedRows) {
        const error = new Error('Song not found');
        error.statusCode = 404;
        throw error;
      }
    });
    return res.json({ message: 'Song deleted successfully' });
  } catch (error) {
    return sendControllerError(res, error, 'Delete song');
  }
};

exports.getAllTags = async (req, res) => {
  try {
    const [tags] = await db.query('SELECT * FROM tags ORDER BY name ASC');
    res.json(tags);
  } catch (error) {
    sendControllerError(res, error, 'Get tags');
  }
};

exports.createTag = async (req, res) => {
  const name = stringValue(req.body.name, { field: 'Tag name', max: 50 });
  const color = stringValue(req.body.color || DEFAULT_TAG_COLOR, { field: 'Tag color', max: 20 });
  if (!name) return res.status(400).json({ message: 'Tag name is required' });
  if (!/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({ message: 'Tag color must be a six-digit hex color' });
  try {
    await db.query(
      'INSERT INTO tags (name, color) VALUES (?, ?)',
      [name, color]
    );
    const [newTag] = await db.query('SELECT * FROM tags WHERE name = ?', [name]);
    return res.status(201).json(newTag[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Tag already exists' });
    return sendControllerError(res, error, 'Create tag');
  }
};

exports.updateTag = async (req, res) => {
  const name = stringValue(req.body.name, { field: 'Tag name', max: 50 });
  const color = stringValue(req.body.color || DEFAULT_TAG_COLOR, { field: 'Tag color', max: 20 });
  if (!name) return res.status(400).json({ message: 'Tag name is required' });
  if (!/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({ message: 'Tag color must be a six-digit hex color' });
  try {
    await db.query(
      'UPDATE tags SET name = ?, color = ? WHERE id = ?',
      [name, color, positiveInt(req.params.id, { field: 'Tag ID' })]
    );
    const [updatedTag] = await db.query('SELECT * FROM tags WHERE id = ?', [req.params.id]);
    if (!updatedTag.length) return res.status(404).json({ message: 'Tag not found' });
    return res.json(updatedTag[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Tag name already exists' });
    return sendControllerError(res, error, 'Update tag');
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const tagId = positiveInt(req.params.id, { field: 'Tag ID' });
    const [result] = await db.query('DELETE FROM tags WHERE id = ?', [tagId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Tag not found' });
    return res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    return sendControllerError(res, error, 'Delete tag');
  }
};

exports.__test__ = { normalizeSongInput, normalizeTagNames, loadSongs };
