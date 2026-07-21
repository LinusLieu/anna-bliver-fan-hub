const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');
const authMiddleware = require('../middleware/auth');
const { requirePermission, PERMISSIONS } = require('../middleware/permissions');

// Public routes
router.get('/', playlistController.getAllPlaylists);
router.get('/tags', playlistController.getAllTags);
router.get('/:id', playlistController.getPlaylistById);

// Protected routes with specific permissions
router.post('/tags', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), playlistController.createTag);
router.put('/tags/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), playlistController.updateTag);
router.delete('/tags/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), playlistController.deleteTag);
router.post('/', authMiddleware, playlistController.createPlaylist);

// Single song operations - requires playlist.edit.single or playlist.edit.batch
router.post('/:playlistId/songs', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), playlistController.addSongToPlaylist);
router.put('/songs/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), playlistController.updateSong);
router.delete('/songs/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), playlistController.deleteSong);

// Batch operations - requires playlist.edit.batch
router.post('/:playlistId/songs/batch', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), playlistController.batchAddSongsToPlaylist);

module.exports = router;
