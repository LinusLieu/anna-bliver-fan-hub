const db = require('../config/database');
const { PERMISSIONS } = require('../middleware/permissions');

const TYPES = [
  [PERMISSIONS.PLAYLIST_MANAGE, '歌单管理'],
  [PERMISSIONS.MARSHMALLOW_MANAGE, '棉花糖管理'],
  [PERMISSIONS.PRIZE_MANAGE, '商城管理'],
  [PERMISSIONS.POINTS_MANAGE, '积分管理'],
  [PERMISSIONS.SITE_CONFIG_MANAGE, '网站配置']
].map(([key, name]) => ({ key, name }));

function requireAdmin(req, res) {
  if (req.userRole === 'admin') return true;
  res.status(403).json({ message: 'Admin access required' });
  return false;
}

exports.getPermissionTypes = (req, res) => res.json(TYPES);

exports.getMyPermissions = async (req, res) => {
  const [rows] = await db.query('SELECT permission_key FROM permissions WHERE user_id = ?', [req.userId]);
  res.json({ role: req.userRole, permissions: rows.map((row) => row.permission_key) });
};

exports.getAllUsersWithPermissions = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const [rows] = await db.query(
    `SELECT u.id, u.username, u.email, u.role,
            GROUP_CONCAT(p.permission_key ORDER BY p.permission_key) AS permissions
     FROM users u LEFT JOIN permissions p ON p.user_id = u.id
     GROUP BY u.id ORDER BY u.id DESC`
  );
  res.json(rows.map((row) => ({ ...row, permissions: row.permissions ? row.permissions.split(',') : [] })));
};

exports.getUserPermissions = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const [users] = await db.query('SELECT id, username, email, role FROM users WHERE id = ?', [req.params.userId]);
  if (!users.length) return res.status(404).json({ message: 'User not found' });
  const [permissions] = await db.query('SELECT permission_key FROM permissions WHERE user_id = ?', [req.params.userId]);
  res.json({ ...users[0], permissions: permissions.map((row) => row.permission_key) });
};

exports.updateUserPermissions = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const requested = Array.isArray(req.body.permissions) ? req.body.permissions : [];
  const allowed = new Set(TYPES.map((item) => item.key));
  if (requested.some((key) => !allowed.has(key))) return res.status(400).json({ message: 'Unknown permission' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (req.body.role) await connection.query('UPDATE users SET role = ? WHERE id = ?', [req.body.role, req.params.userId]);
    await connection.query('DELETE FROM permissions WHERE user_id = ?', [req.params.userId]);
    for (const key of requested) {
      await connection.query('INSERT INTO permissions (user_id, permission_key) VALUES (?, ?)', [req.params.userId, key]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
