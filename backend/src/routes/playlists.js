const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');
const authMiddleware = require('../middleware/auth');
const { requirePermission, PERMISSIONS } = require('../middleware/permissions');
const asyncHandler = require('../utils/asyncHandler');

// Public routes
router.get('/songs', asyncHandler(playlistController.getAllSongs));
router.get('/tags', asyncHandler(playlistController.getAllTags));
router.get('/', asyncHandler(playlistController.getAllPlaylists));
router.get('/:id', asyncHandler(playlistController.getPlaylistById));

// Protected routes with specific permissions
router.post('/tags', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), asyncHandler(playlistController.createTag));
router.put('/tags/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), asyncHandler(playlistController.updateTag));
router.delete('/tags/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), asyncHandler(playlistController.deleteTag));
router.post('/songs', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), asyncHandler(playlistController.addSong));
router.post('/songs/batch', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), asyncHandler(playlistController.batchAddSongs));
router.put('/songs/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), asyncHandler(playlistController.updateSong));
router.delete('/songs/:id', authMiddleware, requirePermission(PERMISSIONS.PLAYLIST_MANAGE), asyncHandler(playlistController.deleteSong));

module.exports = router;
