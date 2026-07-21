const express = require('express');
const router = express.Router();
const pointsController = require('../controllers/pointsController');
const authMiddleware = require('../middleware/auth');
const { requirePermission, PERMISSIONS } = require('../middleware/permissions');
const asyncHandler = require('../utils/asyncHandler');

router.use(authMiddleware);

router.get('/summary', asyncHandler(pointsController.getSummary));
router.get('/transactions', asyncHandler(pointsController.getTransactions));

router.use('/admin', requirePermission(PERMISSIONS.POINTS_MANAGE));
router.get('/admin/accounts', asyncHandler(pointsController.getAdminAccounts));
router.post('/admin/accounts', asyncHandler(pointsController.createAdminAccount));
router.post('/admin/accounts/refresh-names', asyncHandler(pointsController.refreshAdminAccountProfiles));
router.get('/admin/wallets/:walletId/transactions', asyncHandler(pointsController.getAdminWalletTransactions));
router.get('/admin/accounts/:bilibiliUid/transactions', asyncHandler(pointsController.getAdminAccountTransactions));
router.post('/admin/accounts/:bilibiliUid/adjust', asyncHandler(pointsController.adjustAccountPoints));
router.post('/admin/import/preview', asyncHandler(pointsController.previewImport));
router.post('/admin/import/commit', asyncHandler(pointsController.commitImport));
router.get('/admin/export', asyncHandler(pointsController.exportPoints));
router.post('/admin/settle', asyncHandler(pointsController.settle));
router.post('/admin/frozen/merge-all', asyncHandler(pointsController.mergeAllFrozen));

module.exports = router;
