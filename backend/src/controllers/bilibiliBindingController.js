const db = require('../config/database');
const { generateLoginQRCode, pollQRCodeStatus } = require('../utils/bilibiliApi');
const pointsService = require('../services/pointsService');

const QR_TTL_MS = 3 * 60 * 1000;
const sessions = new Map();

function publicBinding(row) {
  return {
    bilibili_uid: String(row.bilibili_uid),
    bilibili_uname: row.bilibili_uname || '',
    bilibili_face: row.bilibili_face || '',
    verified_at: row.verified_at,
    is_primary: Boolean(row.is_primary)
  };
}

exports.createQr = async (req, res) => {
  const [bindings] = await db.query(
    `SELECT id FROM user_bilibili_bindings WHERE user_id = ? AND status = 'verified'`,
    [req.userId]
  );
  if (bindings.length >= pointsService.MAX_BINDINGS_PER_USER) {
    return res.status(409).json({ message: `最多可绑定 ${pointsService.MAX_BINDINGS_PER_USER} 个 B站账号` });
  }

  const result = await generateLoginQRCode();
  if (!result.success) return res.status(502).json({ message: '暂时无法创建 B站扫码会话' });
  const expiresAt = Date.now() + QR_TTL_MS;
  sessions.set(result.qrcode_key, { userId: req.userId, expiresAt, consumed: false });
  setTimeout(() => sessions.delete(result.qrcode_key), QR_TTL_MS).unref?.();
  return res.status(201).json({ qrcode_key: result.qrcode_key, url: result.url, expires_at: new Date(expiresAt).toISOString() });
};

exports.pollQr = async (req, res) => {
  const key = req.params.key;
  const session = sessions.get(key);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(key);
    return res.status(410).json({ status: 'expired', message: '二维码已过期' });
  }
  if (session.userId !== req.userId) return res.status(404).json({ message: '扫码会话不存在' });
  if (session.consumed) return res.status(409).json({ message: '扫码会话已使用' });

  const result = await pollQRCodeStatus(key);
  if (!result.success) return res.json({ status: result.status || 'pending' });

  session.consumed = true;
  const uid = String(result.cookies?.DedeUserID || result.userInfo?.mid || '').trim();
  if (!/^\d{1,20}$/.test(uid)) {
    sessions.delete(key);
    return res.status(502).json({ message: 'B站未返回有效 UID' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [mine] = await connection.query(
      `SELECT id FROM user_bilibili_bindings WHERE user_id = ? AND status = 'verified' FOR UPDATE`,
      [req.userId]
    );
    if (mine.length >= pointsService.MAX_BINDINGS_PER_USER) throw new Error('BINDING_LIMIT');

    const [existing] = await connection.query(
      `SELECT user_id FROM user_bilibili_bindings WHERE bilibili_uid = ? AND status = 'verified' FOR UPDATE`,
      [uid]
    );
    if (existing.some((row) => Number(row.user_id) !== Number(req.userId))) throw new Error('UID_IN_USE');
    if (existing.length) throw new Error('ALREADY_BOUND');

    const uname = String(result.userInfo?.name || result.userInfo?.uname || '').slice(0, 100);
    const face = String(result.userInfo?.face || '').slice(0, 500);
    await connection.query(
      `INSERT INTO user_bilibili_bindings
       (user_id, bilibili_uid, bilibili_uname, bilibili_face, status, is_primary, verified_at)
       VALUES (?, ?, ?, ?, 'verified', ?, NOW())`,
      [req.userId, uid, uname, face, mine.length === 0 ? 1 : 0]
    );
    await pointsService.claimPointAccountForUser(req.userId, uid, uname, face, connection);
    await connection.commit();
    sessions.delete(key);
    return res.json({ status: 'success', binding: { bilibili_uid: uid, bilibili_uname: uname, bilibili_face: face, is_primary: mine.length === 0 } });
  } catch (error) {
    await connection.rollback();
    session.consumed = false;
    const messages = {
      BINDING_LIMIT: '已达到五个 B站账号的绑定上限',
      UID_IN_USE: '该 B站账号已绑定到其他用户',
      ALREADY_BOUND: '该 B站账号已绑定'
    };
    return res.status(409).json({ message: messages[error.message] || '绑定失败' });
  } finally {
    connection.release();
  }
};

exports.getBindingStatus = async (req, res) => {
  const [rows] = await db.query(
    `SELECT bilibili_uid, bilibili_uname, bilibili_face, verified_at, is_primary
     FROM user_bilibili_bindings
     WHERE user_id = ? AND status = 'verified'
     ORDER BY is_primary DESC, verified_at ASC`,
    [req.userId]
  );
  const bindings = rows.map(publicBinding);
  return res.json({ bound: bindings.length > 0, binding_limit: pointsService.MAX_BINDINGS_PER_USER, bindings });
};

exports.setPrimary = async (req, res) => {
  try {
    await pointsService.setPrimaryBilibiliAccount(req.userId, req.params.bilibiliUid);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error.message || '设置主账号失败' });
  }
};

exports.unbind = async (req, res) => {
  const uid = String(req.params.bilibiliUid || '').trim();
  const [rows] = await db.query(
    `SELECT is_primary FROM user_bilibili_bindings WHERE user_id = ? AND bilibili_uid = ? AND status = 'verified'`,
    [req.userId, uid]
  );
  if (!rows.length) return res.status(404).json({ message: '未找到该绑定' });
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM user_bilibili_bindings WHERE user_id = ? AND status = 'verified'`,
    [req.userId]
  );
  if (rows[0].is_primary && Number(countRows[0].total) > 1) {
    return res.status(409).json({ message: '请先将另一个账号设为主账号' });
  }
  await db.query(`DELETE FROM user_bilibili_bindings WHERE user_id = ? AND bilibili_uid = ?`, [req.userId, uid]);
  await pointsService.releasePointAccountForUser(req.userId, uid);
  return res.json({ success: true });
};

exports.__test__ = { sessions, QR_TTL_MS };
