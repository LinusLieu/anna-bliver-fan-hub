const db = require('../config/database');
const { hasPermission, PERMISSIONS } = require('../middleware/permissions');

exports.getAllPlaylists = async (req, res) => {
  try {
    const [playlists] = await db.query(
      'SELECT p.*, u.username as creator_name FROM playlists p LEFT JOIN users u ON p.created_by = u.id ORDER BY p.created_at DESC'
    );

    res.json(playlists);
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getPlaylistById = async (req, res) => {
  try {
    const { id } = req.params;

    const [playlists] = await db.query(
      'SELECT p.*, u.username as creator_name FROM playlists p LEFT JOIN users u ON p.created_by = u.id WHERE p.id = ?',
      [id]
    );

    if (playlists.length === 0) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    // Get songs for this playlist with tags
    const [songs] = await db.query(
      `SELECT
        s.*,
        GROUP_CONCAT(CONCAT(t.name, ':', t.color)) as tags_info
      FROM songs s
      LEFT JOIN song_tags st ON s.id = st.song_id
      LEFT JOIN tags t ON st.tag_id = t.id
      WHERE s.playlist_id = ?
      GROUP BY s.id
      ORDER BY s.song_order ASC`,
      [id]
    );

    // Process tags_info into array
    const songsWithTags = songs.map(song => {
      const tags = song.tags_info ? song.tags_info.split(',').map(tagStr => {
        const [name, color] = tagStr.split(':');
        return { name, color };
      }) : [];
      const { tags_info, ...songData } = song;
      return { ...songData, tags };
    });

    res.json({
      ...playlists[0],
      songs: songsWithTags
    });
  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createPlaylist = async (req, res) => {
  try {
    const { title, description, image_url } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const [result] = await db.query(
      'INSERT INTO playlists (title, description, image_url, created_by) VALUES (?, ?, ?, ?)',
      [title, description, image_url, req.userId]
    );

    res.status(201).json({
      message: 'Playlist created successfully',
      playlistId: result.insertId
    });
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addSongToPlaylist = async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { title, artist, duration, song_order, tags, note } = req.body;

    // Check permissions
    const [playlist] = await db.query('SELECT created_by FROM playlists WHERE id = ?', [playlistId]);
    if (playlist.length === 0) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    if (req.userRole !== 'admin' && playlist[0].created_by !== req.userId) {
      return res.status(403).json({ message: 'You do not have permission to modify this playlist' });
    }

    if (!title || !artist) {
      return res.status(400).json({ message: 'Title and artist are required' });
    }

    const [result] = await db.query(
      'INSERT INTO songs (playlist_id, title, artist, duration, song_order, note) VALUES (?, ?, ?, ?, ?, ?)',
      [playlistId, title, artist, duration, song_order || 0, note || null]
    );

    const newSongId = result.insertId;

    // Add tags if provided
    if (tags && tags.length > 0) {
      const tagNames = tags.map(t => t.name);
      if (tagNames.length > 0) {
        const [dbTags] = await db.query('SELECT id, name FROM tags WHERE name IN (?)', [tagNames]);

        for (const dbTag of dbTags) {
          await db.query(
            'INSERT IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)',
            [newSongId, dbTag.id]
          );
        }
      }
    }

    // Automatic tag linkage: If note is present, ensure '冠歌' (id: 6) is added
    if (note && note.trim() !== '') {
      await db.query(
        'INSERT IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)',
        [newSongId, 6]
      );
    }

    res.status(201).json({
      message: 'Song added successfully',
      songId: newSongId
    });
  } catch (error) {
    console.error('Add song error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.batchAddSongsToPlaylist = async (req, res) => {
  let connection;
  try {
    const { playlistId } = req.params;

    // Check permissions
    const [playlist] = await db.query('SELECT created_by FROM playlists WHERE id = ?', [playlistId]);
    if (playlist.length === 0) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    if (req.userRole !== 'admin' && playlist[0].created_by !== req.userId) {
      return res.status(403).json({ message: 'You do not have permission to modify this playlist' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const { songs } = req.body;

    if (!Array.isArray(songs)) {
      return res.status(400).json({ message: 'Songs must be an array' });
    }

    let addedCount = 0;

    for (const song of songs) {
      const { title, artist, duration, song_order, tags, note } = song;

      if (!title || !artist) continue; // Skip invalid rows

      const [result] = await connection.query(
        'INSERT INTO songs (playlist_id, title, artist, duration, song_order, note) VALUES (?, ?, ?, ?, ?, ?)',
        [playlistId, title, artist, duration, song_order || 0, note || null]
      );

      const newSongId = result.insertId;
      addedCount++;

      // Add tags if provided
      if (tags && tags.length > 0) {
        // tags can be array of strings or objects {name, color}
        // Normalize to names
        const tagNames = tags.map(t => typeof t === 'string' ? t : t.name).filter(Boolean);

        if (tagNames.length > 0) {
          // Find existing tags
          const [dbTags] = await connection.query('SELECT id, name FROM tags WHERE name IN (?)', [tagNames]);
          const existingTagNames = dbTags.map(t => t.name);

          // Create missing tags
          const missingTags = tagNames.filter(name => !existingTagNames.includes(name));
          for (const name of missingTags) {
             // Simple creation for missing tags, default color
             await connection.query('INSERT IGNORE INTO tags (name, color) VALUES (?, ?)', [name, '#6c5ce7']);
          }

          // Re-fetch all tags to get IDs
          const [allDbTags] = await connection.query('SELECT id, name FROM tags WHERE name IN (?)', [tagNames]);

          for (const dbTag of allDbTags) {
            await connection.query(
              'INSERT IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)',
              [newSongId, dbTag.id]
            );
          }
        }
      }

      // Automatic tag linkage: If note is present, ensure '冠歌' (id: 6) is added
      if (note && note.trim() !== '') {
        await connection.query(
          'INSERT IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)',
          [newSongId, 6]
        );
      }
    }

    await connection.commit();
    res.status(201).json({
      message: `Successfully added ${addedCount} songs`,
      count: addedCount
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Batch add songs error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (connection) connection.release();
  }
};

exports.updateSong = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, artist, duration, tags, note } = req.body;

    // Check permissions
    const [song] = await db.query('SELECT playlist_id FROM songs WHERE id = ?', [id]);
    if (song.length === 0) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const playlistId = song[0].playlist_id;
    const [playlist] = await db.query('SELECT created_by FROM playlists WHERE id = ?', [playlistId]);

    if (req.userRole !== 'admin' && (!playlist[0] || playlist[0].created_by !== req.userId)) {
      return res.status(403).json({ message: 'You do not have permission to modify this playlist' });
    }

    if (!title || !artist) {
      return res.status(400).json({ message: 'Title and artist are required' });
    }

    // Update song details
    await db.query(
      'UPDATE songs SET title = ?, artist = ?, duration = ?, note = ? WHERE id = ?',
      [title, artist, duration, note || null, id]
    );

    // Update tags if provided
    if (tags) {
      // Remove existing tags
      await db.query('DELETE FROM song_tags WHERE song_id = ?', [id]);

      // Add new tags
      if (tags.length > 0) {
        // Get tag IDs
        const tagNames = tags.map(t => t.name);
        if (tagNames.length > 0) {
          const [dbTags] = await db.query('SELECT id, name FROM tags WHERE name IN (?)', [tagNames]);

          for (const dbTag of dbTags) {
            await db.query(
              'INSERT IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)',
              [id, dbTag.id]
            );
          }
        }
      }
    }

    // Automatic tag linkage: If note is present, ensure '冠歌' (id: 6) is added
    if (note && note.trim() !== '') {
      await db.query(
        'INSERT IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)',
        [id, 6]
      );
    }

    res.json({ message: 'Song updated successfully' });
  } catch (error) {
    console.error('Update song error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteSong = async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    const [song] = await db.query('SELECT playlist_id FROM songs WHERE id = ?', [id]);
    if (song.length === 0) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const playlistId = song[0].playlist_id;
    const [playlist] = await db.query('SELECT created_by FROM playlists WHERE id = ?', [playlistId]);

    if (req.userRole !== 'admin' && (!playlist[0] || playlist[0].created_by !== req.userId)) {
      return res.status(403).json({ message: 'You do not have permission to modify this playlist' });
    }

    // Delete associated tags first (if no cascade delete)
    await db.query('DELETE FROM song_tags WHERE song_id = ?', [id]);

    // Delete the song
    await db.query('DELETE FROM songs WHERE id = ?', [id]);

    res.json({ message: 'Song deleted successfully' });
  } catch (error) {
    console.error('Delete song error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllTags = async (req, res) => {
  try {
    const [tags] = await db.query('SELECT * FROM tags');
    res.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createTag = async (req, res) => {
  try {
    const { name, color } = req.body;

    if (req.userRole !== 'admin') {
      const canEdit = await hasPermission(req.userId, PERMISSIONS.PLAYLIST_EDIT_SINGLE) ||
                      await hasPermission(req.userId, PERMISSIONS.PLAYLIST_EDIT_BATCH);
      if (!canEdit) {
        return res.status(403).json({ message: 'Permission denied' });
      }
    }

    if (!name) {
      return res.status(400).json({ message: 'Tag name is required' });
    }

    await db.query(
      'INSERT INTO tags (name, color) VALUES (?, ?)',
      [name, color || '#6c5ce7']
    );

    const [newTag] = await db.query('SELECT * FROM tags WHERE name = ?', [name]);

    res.status(201).json(newTag[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Tag already exists' });
    }
    console.error('Create tag error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Permission denied' });
    }

    if (!name) {
      return res.status(400).json({ message: 'Tag name is required' });
    }

    await db.query(
      'UPDATE tags SET name = ?, color = ? WHERE id = ?',
      [name, color || '#6c5ce7', id]
    );

    const [updatedTag] = await db.query('SELECT * FROM tags WHERE id = ?', [id]);

    if (updatedTag.length === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }

    res.json(updatedTag[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Tag name already exists' });
    }
    console.error('Update tag error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Delete associated song_tags first (if no cascade delete)
    await db.query('DELETE FROM song_tags WHERE tag_id = ?', [id]);

    // Delete the tag
    const [result] = await db.query('DELETE FROM tags WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }

    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
