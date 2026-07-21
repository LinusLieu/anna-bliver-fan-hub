const express = require('express');
const router = express.Router();
const marshmallowController = require('../controllers/marshmallowController');
const authMiddleware = require('../middleware/auth');
const optionalAuthMiddleware = require('../middleware/optionalAuth');
const { requirePermission, PERMISSIONS } = require('../middleware/permissions');

// Public routes (with optional auth)
router.post('/', optionalAuthMiddleware, marshmallowController.createMarshmallow);

// Protected routes
router.get('/my', authMiddleware, marshmallowController.getMyMarshmallows);
router.post('/bind', authMiddleware, marshmallowController.bindMarshmallow);

// Admin/Marshmallow manager routes - requires marshmallow.manage permission
router.get('/admin', authMiddleware, requirePermission(PERMISSIONS.MARSHMALLOW_MANAGE), marshmallowController.getAllMarshmallows);
router.put('/:id/reply', authMiddleware, requirePermission(PERMISSIONS.MARSHMALLOW_MANAGE), marshmallowController.replyMarshmallow);
router.post('/:id/read', authMiddleware, requirePermission(PERMISSIONS.MARSHMALLOW_MANAGE), marshmallowController.markAsRead);
router.post('/delete', authMiddleware, requirePermission(PERMISSIONS.MARSHMALLOW_MANAGE), marshmallowController.deleteMarshmallows);

module.exports = router;
