const db = require('../config/database');
const { batchGetUserInfo } = require('../utils/bilibiliApi');

const MAX_BINDINGS_PER_USER = 5;
const CURRENCY_TYPES = Object.freeze({ POINTS: 'points' });
const SOURCES = Object.freeze({
  AUTO: 'auto_bilibili',
  MANUAL: 'manual_adjustment',
  IMPORT: 'csv_import',
  REDEMPTION: 'redemption',
  REDEMPTION_REFUND: 'redemption_refund'
});

const toInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const toUid = (value) => /^\d{1,20}$/.test(String(value || '').trim()) ? String(value).trim() : '';
const normalizeBilibiliFace = (value) => {
  const face = String(value || '').trim();
  if (face.startsWith('//')) return `https:${face}`;
  return face.replace(/^http:\/\//i, 'https://');
};
const metadataValue = (value) => value == null ? null : JSON.stringify(value);

let schemaPromise;
async function ensurePointsSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS point_wallets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      primary_bilibili_uid BIGINT DEFAULT NULL,
      points_balance INT NOT NULL DEFAULT 0,
      remainder_coin BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_wallet (user_id),
      CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.query(`CREATE TABLE IF NOT EXISTS point_accounts (
      bilibili_uid BIGINT PRIMARY KEY,
      bilibili_uname VARCHAR(100) DEFAULT NULL,
      bilibili_face VARCHAR(500) DEFAULT NULL,
      claimed_user_id INT DEFAULT NULL,
      wallet_id INT NOT NULL,
      claimed_at TIMESTAMP NULL DEFAULT NULL,
      last_spent_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_account_wallet (wallet_id),
      CONSTRAINT fk_account_wallet FOREIGN KEY (wallet_id) REFERENCES point_wallets(id),
      CONSTRAINT fk_account_user FOREIGN KEY (claimed_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.query(`CREATE TABLE IF NOT EXISTS point_account_transactions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      wallet_id INT NOT NULL,
      bilibili_uid BIGINT DEFAULT NULL,
      user_id INT DEFAULT NULL,
      source VARCHAR(50) NOT NULL,
      currency_type VARCHAR(20) NOT NULL DEFAULT 'points',
      points_delta INT NOT NULL,
      balance_before INT NOT NULL,
      balance_after INT NOT NULL,
      battery_amount DECIMAL(18,2) DEFAULT 0,
      remainder_battery DECIMAL(18,2) DEFAULT 0,
      room_id BIGINT DEFAULT NULL,
      reference_type VARCHAR(50) DEFAULT NULL,
      reference_id VARCHAR(255) DEFAULT NULL,
      reason TEXT DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      operated_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tx_wallet_created (wallet_id, created_at),
      INDEX idx_tx_uid_created (bilibili_uid, created_at),
      INDEX idx_tx_user_created (user_id, created_at),
      UNIQUE KEY unique_source_reference (source, reference_type, reference_id),
      CONSTRAINT fk_tx_wallet FOREIGN KEY (wallet_id) REFERENCES point_wallets(id),
      CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_tx_operator FOREIGN KEY (operated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.query(`CREATE TABLE IF NOT EXISTS bilibili_point_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      source_event_id VARCHAR(255) NOT NULL,
      event_type ENUM('gift','super_chat') NOT NULL,
      room_id BIGINT NOT NULL,
      bilibili_uid BIGINT NOT NULL,
      bilibili_uname VARCHAR(100) DEFAULT NULL,
      total_coin BIGINT NOT NULL,
      event_at DATETIME NOT NULL,
      payload JSON DEFAULT NULL,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      settled_at TIMESTAMP NULL DEFAULT NULL,
      rejection_reason VARCHAR(255) DEFAULT NULL,
      UNIQUE KEY unique_source_event (source_event_id),
      INDEX idx_event_pending (settled_at, room_id, event_at),
      INDEX idx_event_uid (bilibili_uid, event_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function createAnonymousWallet(connection) {
  const [result] = await connection.query('INSERT INTO point_wallets (points_balance) VALUES (0)');
  return result.insertId;
}

async function ensurePointAccount(connection, { bilibiliUid, bilibiliUname = null, bilibiliFace = null }) {
  const uid = toUid(bilibiliUid);
  if (!uid) throw new Error('Invalid Bilibili UID');
  const [rows] = await connection.query('SELECT wallet_id FROM point_accounts WHERE bilibili_uid = ? FOR UPDATE', [uid]);
  if (!rows.length) {
    const walletId = await createAnonymousWallet(connection);
    await connection.query(
      'INSERT INTO point_accounts (bilibili_uid, bilibili_uname, bilibili_face, wallet_id) VALUES (?, ?, ?, ?)',
      [uid, bilibiliUname || null, normalizeBilibiliFace(bilibiliFace) || null, walletId]
    );
  } else if (bilibiliUname || bilibiliFace) {
    await connection.query(
      'UPDATE point_accounts SET bilibili_uname = COALESCE(?, bilibili_uname), bilibili_face = COALESCE(?, bilibili_face) WHERE bilibili_uid = ?',
      [bilibiliUname || null, normalizeBilibiliFace(bilibiliFace) || null, uid]
    );
  }
  return uid;
}

async function getOrCreateUserWallet(connection, userId) {
  const [rows] = await connection.query('SELECT * FROM point_wallets WHERE user_id = ? FOR UPDATE', [userId]);
  if (rows.length) return rows[0];
  const [result] = await connection.query('INSERT INTO point_wallets (user_id) VALUES (?)', [userId]);
  return { id: result.insertId, user_id: userId, points_balance: 0, remainder_coin: 0 };
}

async function claimPointAccountForUser(userId, bilibiliUid, uname, face, existingConnection = null) {
  await ensurePointsSchema();
  const ownConnection = !existingConnection;
  const connection = existingConnection || await db.getConnection();
  try {
    if (ownConnection) await connection.beginTransaction();
    const uid = await ensurePointAccount(connection, { bilibiliUid, bilibiliUname: uname, bilibiliFace: face });
    const [accountRows] = await connection.query(
      `SELECT pa.*, pw.points_balance, pw.remainder_coin, pw.user_id AS wallet_user_id
       FROM point_accounts pa JOIN point_wallets pw ON pw.id = pa.wallet_id
       WHERE pa.bilibili_uid = ? FOR UPDATE`, [uid]
    );
    const account = accountRows[0];
    if (account.claimed_user_id && Number(account.claimed_user_id) !== Number(userId)) throw new Error('UID already belongs to another user');
    const wallet = await getOrCreateUserWallet(connection, userId);
    if (Number(account.wallet_id) !== Number(wallet.id)) {
      await connection.query(
        'UPDATE point_wallets SET points_balance = points_balance + ?, remainder_coin = remainder_coin + ? WHERE id = ?',
        [toInt(account.points_balance), toInt(account.remainder_coin), wallet.id]
      );
      await connection.query('UPDATE point_accounts SET wallet_id = ?, claimed_user_id = ?, claimed_at = NOW() WHERE bilibili_uid = ?', [wallet.id, userId, uid]);
      await connection.query('DELETE FROM point_wallets WHERE id = ? AND user_id IS NULL', [account.wallet_id]);
    } else {
      await connection.query('UPDATE point_accounts SET claimed_user_id = ?, claimed_at = NOW() WHERE bilibili_uid = ?', [userId, uid]);
    }
    const [primary] = await connection.query(
      `SELECT bilibili_uid FROM user_bilibili_bindings WHERE user_id = ? AND status = 'verified' ORDER BY is_primary DESC, verified_at ASC LIMIT 1`,
      [userId]
    );
    await connection.query('UPDATE point_wallets SET primary_bilibili_uid = ? WHERE id = ?', [primary[0]?.bilibili_uid || uid, wallet.id]);
    if (ownConnection) await connection.commit();
    return { wallet_id: wallet.id, bilibili_uid: uid };
  } catch (error) {
    if (ownConnection) await connection.rollback();
    throw error;
  } finally {
    if (ownConnection) connection.release();
  }
}

async function setPrimaryBilibiliAccount(userId, value) {
  await ensurePointsSchema();
  const uid = toUid(value);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id FROM user_bilibili_bindings WHERE user_id = ? AND bilibili_uid = ? AND status = 'verified' FOR UPDATE`,
      [userId, uid]
    );
    if (!rows.length) throw new Error('B站账号未绑定');
    await connection.query('UPDATE user_bilibili_bindings SET is_primary = 0 WHERE user_id = ?', [userId]);
    await connection.query('UPDATE user_bilibili_bindings SET is_primary = 1 WHERE id = ?', [rows[0].id]);
    await connection.query('UPDATE point_wallets SET primary_bilibili_uid = ? WHERE user_id = ?', [uid, userId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function releasePointAccountForUser(userId, value) {
  await ensurePointsSchema();
  const uid = toUid(value);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT wallet_id FROM point_accounts WHERE bilibili_uid = ? AND claimed_user_id = ? FOR UPDATE', [uid, userId]);
    if (rows.length) {
      const walletId = await createAnonymousWallet(connection);
      await connection.query('UPDATE point_accounts SET claimed_user_id = NULL, claimed_at = NULL, wallet_id = ? WHERE bilibili_uid = ?', [walletId, uid]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getUserBindings(userId) {
  const [rows] = await db.query(
    `SELECT bilibili_uid, bilibili_uname, bilibili_face, verified_at, is_primary
     FROM user_bilibili_bindings WHERE user_id = ? AND status = 'verified' ORDER BY is_primary DESC, verified_at ASC`, [userId]
  );
  return rows;
}

async function aggregateSources(walletId) {
  const [rows] = await db.query(
    `SELECT source, COALESCE(SUM(points_delta), 0) AS total FROM point_account_transactions WHERE wallet_id = ? GROUP BY source`, [walletId]
  );
  return Object.fromEntries(rows.map((row) => [row.source, toInt(row.total)]));
}

async function getPointSummary(userId) {
  await ensurePointsSchema();
  const [wallets] = await db.query('SELECT * FROM point_wallets WHERE user_id = ?', [userId]);
  if (!wallets.length) return { points: 0, total_points: 0, remainder_battery: 0, bindings: await getUserBindings(userId) };
  const wallet = wallets[0];
  const sources = await aggregateSources(wallet.id);
  return {
    wallet_id: wallet.id,
    points: toInt(wallet.points_balance),
    total_points: toInt(wallet.points_balance),
    remainder_battery: toInt(wallet.remainder_coin) / 100,
    auto_points: toInt(sources[SOURCES.AUTO]),
    manual_points: toInt(sources[SOURCES.MANUAL]),
    import_points: toInt(sources[SOURCES.IMPORT]),
    redemption_spent: Math.abs(Math.min(0, toInt(sources[SOURCES.REDEMPTION]))),
    bindings: await getUserBindings(userId)
  };
}

async function getUserPointBalances(userId) {
  const summary = await getPointSummary(userId);
  return { points: summary.points || 0, total_points: summary.total_points || 0 };
}

function txWhere(filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.source && filters.source !== 'all') { clauses.push('t.source = ?'); params.push(filters.source); }
  if (filters.direction === 'income') clauses.push('t.points_delta > 0');
  if (filters.direction === 'expense') clauses.push('t.points_delta < 0');
  if (filters.start_date) { clauses.push('t.created_at >= ?'); params.push(`${filters.start_date} 00:00:00`); }
  if (filters.end_date) { clauses.push('t.created_at <= ?'); params.push(`${filters.end_date} 23:59:59`); }
  if (filters.keyword) { clauses.push('(t.reason LIKE ? OR t.reference_id LIKE ?)'); params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

async function getTransactions(baseSql, baseParams, page = 1, limit = 20, filters = {}) {
  const safePage = Math.max(1, toInt(page, 1));
  const safeLimit = Math.min(100, Math.max(1, toInt(limit, 20)));
  const where = txWhere(filters);
  const [counts] = await db.query(`SELECT COUNT(*) AS total FROM point_account_transactions t WHERE ${baseSql}${where.sql}`, [...baseParams, ...where.params]);
  const [rows] = await db.query(
    `SELECT t.*, pa.bilibili_uname, pa.bilibili_face
     FROM point_account_transactions t LEFT JOIN point_accounts pa ON pa.bilibili_uid = t.bilibili_uid
     WHERE ${baseSql}${where.sql} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [...baseParams, ...where.params, safeLimit, (safePage - 1) * safeLimit]
  );
  const total = toInt(counts[0].total);
  return { transactions: rows, pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
}

async function getUserTransactions(userId, page, limit, filters) {
  return getTransactions('t.user_id = ?', [userId], page, limit, filters);
}
async function getTransactionsByUid(uid, page, limit, filters) {
  return getTransactions('t.bilibili_uid = ?', [toUid(uid)], page, limit, filters);
}
async function getTransactionsByWalletId(walletId, page, limit, filters) {
  return getTransactions('t.wallet_id = ?', [toInt(walletId)], page, limit, filters);
}

async function createPointAccount({ bilibiliUid, bilibiliUname, bilibiliFace }) {
  await ensurePointsSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const uid = await ensurePointAccount(connection, { bilibiliUid, bilibiliUname, bilibiliFace });
    await connection.commit();
    return { bilibili_uid: uid, bilibili_uname: bilibiliUname || '' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function insertPointTransaction(connection, input) {
  const uid = input.bilibiliUid ? await ensurePointAccount(connection, { bilibiliUid: input.bilibiliUid }) : null;
  let walletId = input.walletId;
  if (!walletId && uid) {
    const [rows] = await connection.query('SELECT wallet_id FROM point_accounts WHERE bilibili_uid = ? FOR UPDATE', [uid]);
    walletId = rows[0]?.wallet_id;
  }
  if (!walletId && input.userId) walletId = (await getOrCreateUserWallet(connection, input.userId)).id;
  const [wallets] = await connection.query('SELECT * FROM point_wallets WHERE id = ? FOR UPDATE', [walletId]);
  if (!wallets.length) throw new Error('Point wallet not found');
  const before = toInt(wallets[0].points_balance);
  const after = before + toInt(input.delta);
  if (after < 0 && !input.allowNegativeBalance) throw new Error('Insufficient points');
  await connection.query('UPDATE point_wallets SET points_balance = ? WHERE id = ?', [after, walletId]);
  await connection.query(
    `INSERT INTO point_account_transactions
     (wallet_id, bilibili_uid, user_id, source, points_delta, balance_before, balance_after, battery_amount,
      remainder_battery, room_id, reference_type, reference_id, reason, metadata, operated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [walletId, uid, input.userId || wallets[0].user_id || null, input.source, toInt(input.delta), before, after,
      Number(input.batteryAmount || 0), Number(input.remainderBattery || 0), input.roomId || null,
      input.referenceType || null, input.referenceId || null, input.reason || null, metadataValue(input.metadata), input.operatedBy || null]
  );
  return { before, after, wallet_id: walletId, bilibili_uid: uid };
}

async function adjustAccountPoints(uid, delta, reason, operatedBy) {
  await ensurePointsSchema();
  const safeDelta = toInt(delta);
  if (!safeDelta) throw new Error('Points delta must not be zero');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await insertPointTransaction(connection, { bilibiliUid: uid, source: SOURCES.MANUAL, delta: safeDelta, reason, operatedBy, allowNegativeBalance: true });
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function recordRedemption(connection, userId, cost, redemptionId, prizeId, currencyType = 'points') {
  if (currencyType !== 'points') throw new Error('Only points are supported');
  return insertPointTransaction(connection, {
    userId, source: SOURCES.REDEMPTION, delta: -Math.abs(toInt(cost)), referenceType: 'redemption',
    referenceId: String(redemptionId), reason: 'Prize redemption', metadata: { prize_id: prizeId }
  });
}

async function refundRedemption(connection, input) {
  if (input.currencyType && input.currencyType !== 'points') throw new Error('Only points are supported');
  const referenceId = String(input.redemptionId);
  const [existing] = await connection.query(
    'SELECT id FROM point_account_transactions WHERE source = ? AND reference_type = ? AND reference_id = ?',
    [SOURCES.REDEMPTION_REFUND, 'redemption_refund', referenceId]
  );
  if (existing.length) return { duplicate: true };
  return insertPointTransaction(connection, {
    userId: input.userId, walletId: input.walletId, bilibiliUid: input.bilibiliUid,
    source: SOURCES.REDEMPTION_REFUND, delta: Math.abs(toInt(input.currencyCost ?? input.pointsCost)),
    referenceType: 'redemption_refund', referenceId, reason: input.reason || 'Prize redemption refund',
    metadata: { prize_id: input.prizeId }, operatedBy: input.operatedBy
  });
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

async function previewImport(csv) {
  const lines = String(csv || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV must include a header and at least one row');
  const headers = parseCsvLine(lines[0]).map((item) => item.toLowerCase());
  const uidIndex = headers.indexOf('bilibili_uid');
  const pointsIndex = headers.indexOf('points');
  const nameIndex = headers.indexOf('bilibili_uname');
  const reasonIndex = headers.indexOf('reason');
  if (uidIndex < 0 || pointsIndex < 0) throw new Error('CSV header must include bilibili_uid and points');
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const uid = toUid(cells[uidIndex]);
    const points = toInt(cells[pointsIndex], NaN);
    const error = !uid ? 'Invalid Bilibili UID' : (!Number.isFinite(points) || points === 0 ? 'Points must be a non-zero integer' : '');
    return { line: index + 2, bilibili_uid: uid || cells[uidIndex], bilibili_uname: nameIndex >= 0 ? cells[nameIndex] : '', points, reason: reasonIndex >= 0 ? cells[reasonIndex] : '', status: error ? 'error' : 'valid', error };
  });
  return { rows, valid_count: rows.filter((row) => row.status === 'valid').length, error_count: rows.filter((row) => row.status === 'error').length, total_points: rows.filter((row) => row.status === 'valid').reduce((sum, row) => sum + row.points, 0) };
}

async function commitImport(csv, operatedBy, defaultReason) {
  const preview = await previewImport(csv);
  if (preview.error_count) { const error = new Error('CSV contains invalid rows'); error.preview = preview; throw error; }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const row of preview.rows) {
      await ensurePointAccount(connection, { bilibiliUid: row.bilibili_uid, bilibiliUname: row.bilibili_uname });
      await insertPointTransaction(connection, { bilibiliUid: row.bilibili_uid, source: SOURCES.IMPORT, delta: row.points, reason: row.reason || defaultReason, operatedBy, allowNegativeBalance: true });
    }
    await connection.commit();
    return { imported_count: preview.valid_count, total_points: preview.total_points };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function listAdminAccounts({ page = 1, limit = 20, search = '' }) {
  await ensurePointsSchema();
  const safePage = Math.max(1, toInt(page, 1));
  const safeLimit = Math.min(100, Math.max(1, toInt(limit, 20)));
  const query = `%${search}%`;
  const [countRows] = await db.query(
    `SELECT COUNT(DISTINCT pw.id) AS total FROM point_wallets pw
     LEFT JOIN point_accounts pa ON pa.wallet_id = pw.id LEFT JOIN users u ON u.id = pw.user_id
     WHERE ? = '%%' OR pa.bilibili_uid LIKE ? OR pa.bilibili_uname LIKE ? OR u.username LIKE ? OR u.email LIKE ?`,
    [query, query, query, query, query]
  );
  const [rows] = await db.query(
    `SELECT pw.id AS wallet_id, pw.points_balance AS points, pw.points_balance AS total_points,
            pw.remainder_coin / 100 AS remainder_battery, u.username, u.email,
            GROUP_CONCAT(pa.bilibili_uid ORDER BY pa.bilibili_uid) AS member_uids,
            MAX(CASE WHEN pa.bilibili_uid = pw.primary_bilibili_uid THEN pa.bilibili_uid END) AS bilibili_uid,
            MAX(CASE WHEN pa.bilibili_uid = pw.primary_bilibili_uid THEN pa.bilibili_uname END) AS bilibili_uname
     FROM point_wallets pw LEFT JOIN point_accounts pa ON pa.wallet_id = pw.id LEFT JOIN users u ON u.id = pw.user_id
     WHERE ? = '%%' OR pa.bilibili_uid LIKE ? OR pa.bilibili_uname LIKE ? OR u.username LIKE ? OR u.email LIKE ?
     GROUP BY pw.id ORDER BY pw.updated_at DESC LIMIT ? OFFSET ?`,
    [query, query, query, query, query, safeLimit, (safePage - 1) * safeLimit]
  );
  for (const row of rows) {
    row.bilibili_uid ||= String(row.member_uids || '').split(',')[0] || null;
    const sources = await aggregateSources(row.wallet_id);
    row.auto_points = toInt(sources[SOURCES.AUTO]); row.manual_points = toInt(sources[SOURCES.MANUAL]);
    row.import_points = toInt(sources[SOURCES.IMPORT]); row.redemption_spent = Math.abs(Math.min(0, toInt(sources[SOURCES.REDEMPTION])));
    row.member_uids = row.member_uids ? row.member_uids.split(',') : [];
  }
  const total = toInt(countRows[0].total);
  return { accounts: rows, pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
}

async function refreshAccountProfiles(uids = [], { refreshAll = false } = {}) {
  await ensurePointsSchema();
  let targets = [...new Set(uids.map(toUid).filter(Boolean))];
  if (refreshAll || !targets.length) {
    const [rows] = await db.query('SELECT bilibili_uid FROM point_accounts');
    targets = rows.map((row) => String(row.bilibili_uid));
  }
  const profiles = await batchGetUserInfo(targets);
  let updated = 0;
  for (const uid of targets) {
    const profile = profiles[String(uid)];
    if (!profile) continue;
    await db.query('UPDATE point_accounts SET bilibili_uname = ?, bilibili_face = ? WHERE bilibili_uid = ?', [profile.name || '', normalizeBilibiliFace(profile.face), uid]);
    await db.query('UPDATE user_bilibili_bindings SET bilibili_uname = ?, bilibili_face = ? WHERE bilibili_uid = ?', [profile.name || '', normalizeBilibiliFace(profile.face), uid]);
    updated += 1;
  }
  return { requested_count: targets.length, updated_count: updated, failed_count: targets.length - updated };
}

function escapeCsv(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
async function exportAccountsCsv(search = '') {
  const result = await listAdminAccounts({ page: 1, limit: 10000, search });
  return [['bilibili_uid', 'bilibili_uname', 'points', 'username', 'email'], ...result.accounts.map((row) => [row.bilibili_uid, row.bilibili_uname, row.points, row.username, row.email])].map((row) => row.map(escapeCsv).join(',')).join('\n');
}
async function exportTransactionsCsv(search = '') {
  const [rows] = await db.query(
    `SELECT t.id, t.bilibili_uid, t.source, t.points_delta, t.balance_before, t.balance_after, t.reason, t.created_at
     FROM point_account_transactions t LEFT JOIN point_accounts pa ON pa.bilibili_uid = t.bilibili_uid
     WHERE ? = '%%' OR t.bilibili_uid LIKE ? OR pa.bilibili_uname LIKE ? OR t.reason LIKE ? ORDER BY t.id DESC`,
    [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
  );
  return [['id', 'bilibili_uid', 'source', 'points_delta', 'balance_before', 'balance_after', 'reason', 'created_at'], ...rows.map(Object.values)].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

async function ingestBilibiliPointEvent(event) {
  await ensurePointsSchema();
  const eventId = String(event.event_id || '').trim();
  const uid = toUid(event.uid);
  const roomId = toUid(event.room_id);
  const totalCoin = toInt(event.total_coin, -1);
  const eventAt = new Date(event.timestamp || event.event_at || Date.now());
  if (!eventId || !uid || !roomId || totalCoin < 0 || Number.isNaN(eventAt.getTime())) throw new Error('Invalid event payload');
  if (!['gift', 'super_chat'].includes(event.type)) throw new Error('Unsupported event type');
  const [result] = await db.query(
    `INSERT IGNORE INTO bilibili_point_events
     (source_event_id, event_type, room_id, bilibili_uid, bilibili_uname, total_coin, event_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [eventId, event.type, roomId, uid, String(event.username || '').slice(0, 100), totalCoin, eventAt, metadataValue(event)]
  );
  if (!result.affectedRows) return { duplicate: true };
  await settleBilibiliPoints();
  return { duplicate: false };
}

async function settleBilibiliPoints({ operatedBy = null } = {}) {
  await ensurePointsSchema();
  const configuredRoom = toUid(process.env.POINTS_ROOM_ID);
  if (!configuredRoom) return { skipped: true, reason: 'POINTS_ROOM_ID is not configured', processed_accounts: 0, awarded_points: 0 };
  const startAt = process.env.POINTS_START_AT ? new Date(process.env.POINTS_START_AT) : new Date(0);
  const coinPerPoint = Math.max(1, toInt(process.env.POINTS_COIN_PER_POINT, 100));
  const [uids] = await db.query(
    `SELECT DISTINCT bilibili_uid FROM bilibili_point_events
     WHERE settled_at IS NULL AND room_id = ? AND event_at >= ? ORDER BY bilibili_uid`,
    [configuredRoom, startAt]
  );
  const summary = { target_room_id: configuredRoom, processed_accounts: 0, awarded_points: 0, processed_events: 0 };
  for (const row of uids) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const uid = await ensurePointAccount(connection, { bilibiliUid: row.bilibili_uid });
      const [accountRows] = await connection.query(
        `SELECT pw.id AS wallet_id, pw.remainder_coin FROM point_accounts pa JOIN point_wallets pw ON pw.id = pa.wallet_id WHERE pa.bilibili_uid = ? FOR UPDATE`, [uid]
      );
      const [events] = await connection.query(
        `SELECT * FROM bilibili_point_events WHERE settled_at IS NULL AND room_id = ? AND bilibili_uid = ? AND event_at >= ? ORDER BY event_at, id FOR UPDATE`,
        [configuredRoom, uid, startAt]
      );
      if (!events.length) { await connection.rollback(); continue; }
      const coin = events.reduce((sum, item) => sum + toInt(item.total_coin), toInt(accountRows[0].remainder_coin));
      const points = Math.floor(coin / coinPerPoint);
      const remainder = coin % coinPerPoint;
      if (points > 0) {
        await insertPointTransaction(connection, {
          bilibiliUid: uid, walletId: accountRows[0].wallet_id, source: SOURCES.AUTO, delta: points,
          batteryAmount: events.reduce((sum, item) => sum + toInt(item.total_coin), 0) / 100,
          remainderBattery: remainder / 100, roomId: configuredRoom, referenceType: 'bilibili_event_batch',
          referenceId: `${events[0].id}:${events[events.length - 1].id}`, reason: 'Bilibili gift and SC settlement',
          metadata: { event_ids: events.map((item) => item.source_event_id), coin_per_point: coinPerPoint }, operatedBy
        });
      }
      await connection.query('UPDATE point_wallets SET remainder_coin = ? WHERE id = ?', [remainder, accountRows[0].wallet_id]);
      await connection.query(`UPDATE bilibili_point_events SET settled_at = NOW() WHERE id IN (${events.map(() => '?').join(',')})`, events.map((item) => item.id));
      await connection.commit();
      summary.processed_accounts += 1; summary.awarded_points += points; summary.processed_events += events.length;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  await db.query(
    `UPDATE bilibili_point_events SET settled_at = NOW(), rejection_reason = 'room_or_time_filter'
     WHERE settled_at IS NULL AND (room_id <> ? OR event_at < ?)`, [configuredRoom, startAt]
  );
  return summary;
}

async function mergeAllFrozenPoints() { return { merged_accounts: 0, merged_points: 0, note: 'Public schema has no frozen balance' }; }
function scheduleDailySettlement() {
  const timer = setInterval(() => settleBilibiliPoints().catch((error) => console.error('[points] settlement failed:', error.message)), 60 * 1000);
  timer.unref?.();
  return timer;
}

function buildResolvedImportUser({ uid, account, bilibiliProfile }) {
  return {
    bilibili_uid: String(uid), bilibili_uname: bilibiliProfile?.name || account?.bilibili_uname || '',
    bilibili_face: normalizeBilibiliFace(bilibiliProfile?.face || account?.bilibili_face || ''),
    source: bilibiliProfile ? 'bilibili' : (account ? 'local' : 'none'), wallet_id: account?.wallet_id || null,
    website_username: account?.username || null, website_email: account?.email || null, current_points: toInt(account?.points_balance)
  };
}

module.exports = {
  MAX_BINDINGS_PER_USER, CURRENCY_TYPES, SOURCES, ensurePointsSchema, getPointSummary, getUserPointBalances, getUserTransactions,
  getUserBindings, getTransactionsByUid, getTransactionsByWalletId, listAdminAccounts, refreshAccountProfiles,
  createPointAccount, adjustAccountPoints, recordRedemption, refundRedemption, settleBilibiliPoints,
  mergeAllFrozenPoints, previewImport, commitImport, exportAccountsCsv, exportTransactionsCsv,
  claimPointAccountForUser, setPrimaryBilibiliAccount, releasePointAccountForUser,
  ingestBilibiliPointEvent, scheduleDailySettlement,
  __test__: { buildResolvedImportUser, normalizeBilibiliFace }
};
