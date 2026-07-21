const pointsService = require('../services/pointsService');
const POINT_FILTER = { currency_type: 'points' };

function requireAdmin(req, res) {
  if (req.userRole !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return false;
  }
  return true;
}

exports.getSummary = async (req, res) => {
  try {
    const summary = await pointsService.getPointSummary(req.userId);
    if (!summary) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(summary);
  } catch (error) {
    console.error('Get points summary error:', error);
    res.status(500).json({ message: 'Failed to load points summary' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const result = await pointsService.getUserTransactions(
      req.userId,
      req.query.page,
      req.query.limit,
      { ...req.query, ...POINT_FILTER }
    );
    res.json(result);
  } catch (error) {
    console.error('Get points transactions error:', error);
    res.status(500).json({ message: 'Failed to load points transactions' });
  }
};

exports.getAdminAccounts = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.listAdminAccounts({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search || ''
    });
    res.json(result);
  } catch (error) {
    console.error('Get admin points accounts error:', error);
    res.status(500).json({ message: 'Failed to load point accounts' });
  }
};

exports.refreshAdminAccountProfiles = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.refreshAccountProfiles(req.body.bilibili_uids || [], {
      refreshAll: req.body.refresh_all !== false
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Refresh point account profiles error:', error);
    res.status(400).json({ message: error.message || 'Failed to refresh Bilibili profiles' });
  }
};

exports.createAdminAccount = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const account = await pointsService.createPointAccount({
      bilibiliUid: req.body.bilibili_uid,
      bilibiliUname: req.body.bilibili_uname || null,
      bilibiliFace: req.body.bilibili_face || null
    });
    res.status(201).json({ success: true, account });
  } catch (error) {
    console.error('Create point account error:', error);
    res.status(400).json({ message: error.message || 'Failed to create point account' });
  }
};

exports.getAdminAccountTransactions = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.getTransactionsByUid(
      req.params.bilibiliUid,
      req.query.page,
      req.query.limit,
      { ...req.query, ...POINT_FILTER }
    );
    res.json(result);
  } catch (error) {
    console.error('Get admin account transactions error:', error);
    res.status(400).json({ message: error.message || 'Failed to load account transactions' });
  }
};

exports.getAdminWalletTransactions = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.getTransactionsByWalletId(
      req.params.walletId,
      req.query.page,
      req.query.limit,
      { ...req.query, ...POINT_FILTER }
    );
    res.json(result);
  } catch (error) {
    console.error('Get admin wallet transactions error:', error);
    res.status(400).json({ message: error.message || 'Failed to load wallet transactions' });
  }
};

exports.adjustAccountPoints = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { points_delta, reason } = req.body;
    const result = await pointsService.adjustAccountPoints(
      req.params.bilibiliUid,
      points_delta,
      reason,
      req.userId
    );

    res.json({
      success: true,
      bilibili_uid: result.bilibili_uid,
      balance_before: result.before,
      balance_after: result.after
    });
  } catch (error) {
    console.error('Adjust account points error:', error);
    res.status(400).json({ message: error.message || 'Failed to adjust points' });
  }
};

exports.previewImport = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.previewImport(req.body.csv || '');
    res.json(result);
  } catch (error) {
    console.error('Preview points import error:', error);
    res.status(400).json({ message: error.message || 'Failed to preview import' });
  }
};

exports.commitImport = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.commitImport(
      req.body.csv || '',
      req.userId,
      req.body.reason || null
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Commit points import error:', error);
    res.status(400).json({
      message: error.message || 'Failed to import points',
      preview: error.preview
    });
  }
};

exports.exportPoints = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const type = req.query.type === 'transactions' ? 'transactions' : 'accounts';
    const csv = type === 'transactions'
      ? await pointsService.exportTransactionsCsv(req.query.search || '')
      : await pointsService.exportAccountsCsv(req.query.search || '');

    const filename = `points-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('Export points error:', error);
    res.status(500).json({ message: 'Failed to export points' });
  }
};

exports.settle = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.settleBilibiliPoints({ operatedBy: req.userId });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Manual points settlement error:', error);
    res.status(500).json({ message: error.message || 'Failed to settle points' });
  }
};

exports.mergeAllFrozen = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pointsService.mergeAllFrozenPoints(req.userId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Merge frozen points error:', error);
    res.status(500).json({ message: error.message || 'Failed to merge frozen points' });
  }
};
