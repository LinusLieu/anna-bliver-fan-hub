const express = require('express');
const router = express.Router();
const pointsController = require('../controllers/pointsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/summary', pointsController.getSummary);
router.get('/transactions', pointsController.getTransactions);

router.get('/admin/accounts', pointsController.getAdminAccounts);
router.post('/admin/accounts', pointsController.createAdminAccount);
router.post('/admin/accounts/refresh-names', pointsController.refreshAdminAccountProfiles);
router.get('/admin/wallets/:walletId/transactions', pointsController.getAdminWalletTransactions);
router.get('/admin/accounts/:bilibiliUid/transactions', pointsController.getAdminAccountTransactions);
router.post('/admin/accounts/:bilibiliUid/adjust', pointsController.adjustAccountPoints);
router.post('/admin/import/preview', pointsController.previewImport);
router.post('/admin/import/commit', pointsController.commitImport);
router.get('/admin/export', pointsController.exportPoints);
router.post('/admin/settle', pointsController.settle);
router.post('/admin/frozen/merge-all', pointsController.mergeAllFrozen);

module.exports = router;
