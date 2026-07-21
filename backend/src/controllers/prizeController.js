const db = require('../config/database');
const pointsService = require('../services/pointsService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const requireAdmin = (req, res) => req.userRole === 'admin' || (fail(res, 403, 'Admin access required'), false);
const normalizeDelivery = (value) => ['physical', 'virtual'].includes(value) ? value : 'physical';

async function imagesFor(prizeIds) {
  if (!prizeIds.length) return new Map();
  const [rows] = await db.query(`SELECT * FROM prize_images WHERE prize_id IN (${prizeIds.map(() => '?').join(',')}) ORDER BY sort_order, id`, prizeIds);
  const map = new Map();
  for (const row of rows) map.set(row.prize_id, [...(map.get(row.prize_id) || []), row]);
  return map;
}

async function optionsFor(prizeIds, activeOnly = false) {
  if (!prizeIds.length) return new Map();
  const [rows] = await db.query(
    `SELECT * FROM prize_options WHERE prize_id IN (${prizeIds.map(() => '?').join(',')}) ${activeOnly ? 'AND is_active = 1' : ''} ORDER BY sort_order, id`,
    prizeIds
  );
  const map = new Map();
  for (const row of rows) map.set(row.prize_id, [...(map.get(row.prize_id) || []), row]);
  return map;
}

async function hydratePrizes(rows, activeOnly = false) {
  const ids = rows.map((row) => row.id);
  const [imageMap, optionMap] = await Promise.all([imagesFor(ids), optionsFor(ids, activeOnly)]);
  return rows.map((row) => {
    const options = optionMap.get(row.id) || [];
    const prices = (options.length ? options : [row]).map((item) => int(item.cost));
    return {
      ...row,
      images: imageMap.get(row.id) || [],
      options,
      price_ranges: { points: { min: Math.min(...prices), max: Math.max(...prices) } }
    };
  });
}

const getAllPrizes = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM prizes WHERE is_deleted = 0 AND is_active = 1 ORDER BY sort_order, id DESC');
  ok(res, await hydratePrizes(rows, true));
};

const getPrizeById = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM prizes WHERE id = ? AND is_deleted = 0 AND is_active = 1', [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Prize not found');
  return ok(res, (await hydratePrizes(rows, true))[0]);
};

async function addressSnapshot(connection, userId, addressId) {
  if (!addressId) return null;
  const [rows] = await connection.query('SELECT * FROM shipping_addresses WHERE id = ? AND user_id = ?', [addressId, userId]);
  if (!rows.length) throw new Error('Shipping address not found');
  return rows[0];
}

const createRedemptionLine = async (connection, userId, lineInput) => {
  const quantity = Math.max(1, int(lineInput.quantity, 1));
  const [prizes] = await connection.query('SELECT * FROM prizes WHERE id = ? AND is_deleted = 0 AND is_active = 1 FOR UPDATE', [lineInput.prizeId]);
  if (!prizes.length) throw new Error('Prize not found');
  const prize = prizes[0];
  let option = null;
  if (lineInput.prizeOptionId) {
    const [rows] = await connection.query('SELECT * FROM prize_options WHERE id = ? AND prize_id = ? AND is_active = 1 FOR UPDATE', [lineInput.prizeOptionId, prize.id]);
    if (!rows.length) throw new Error('Prize option not found');
    option = rows[0];
  }
  const stock = option ? int(option.stock) : int(prize.stock);
  if (stock < quantity) throw new Error('Insufficient stock');
  const unitCost = int(option?.cost ?? prize.cost);
  const totalCost = unitCost * quantity;
  if (normalizeDelivery(prize.delivery_type) === 'physical' && !lineInput.addressId) throw new Error('Shipping address is required');

  const [redemptionResult] = await connection.query(
    `INSERT INTO redemptions
     (order_id, user_id, prize_id, prize_option_id, quantity, points_cost, currency_type, unit_cost, status, address_id, remark)
     VALUES (?, ?, ?, ?, ?, ?, 'points', ?, 'pending', ?, ?)`,
    [lineInput.orderId, userId, prize.id, option?.id || null, quantity, totalCost, unitCost, lineInput.addressId || null, lineInput.remark || '']
  );
  const pointResult = await pointsService.recordRedemption(connection, userId, totalCost, redemptionResult.insertId, prize.id, 'points');
  if (option) await connection.query('UPDATE prize_options SET stock = stock - ? WHERE id = ?', [quantity, option.id]);
  else await connection.query('UPDATE prizes SET stock = stock - ? WHERE id = ?', [quantity, prize.id]);
  return { id: redemptionResult.insertId, prize_id: prize.id, prize_name: prize.name, option_name: option?.name || '', quantity, unit_cost: unitCost, points_cost: totalCost, remaining_points: pointResult.after };
};

async function createOrder(connection, userId, addressId, remark) {
  const address = await addressSnapshot(connection, userId, addressId);
  const [result] = await connection.query(
    `INSERT INTO prize_orders
     (user_id, status, recipient_name, phone, province, city, district, address_line, postal_code, remark)
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, address?.recipient_name || null, address?.phone || null, address?.province || null, address?.city || null,
      address?.district || null, address?.address_line || null, address?.postal_code || null, remark || '']
  );
  return result.insertId;
}

const redeemPrize = async (req, res) => {
  if ((req.body.currency_type || 'points') !== 'points') return fail(res, 400, 'Only points are supported');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const orderId = await createOrder(connection, req.userId, req.body.address_id, req.body.remark);
    const redemption = await createRedemptionLine(connection, req.userId, {
      orderId, prizeId: req.body.prizeId, prizeOptionId: req.body.prize_option_id,
      quantity: req.body.quantity, addressId: req.body.address_id, remark: req.body.remark
    });
    await connection.query('UPDATE prize_orders SET points_total = ? WHERE id = ?', [redemption.points_cost, orderId]);
    await connection.commit();
    return ok(res, { order_id: orderId, redemption, remaining_points: redemption.remaining_points }, 201);
  } catch (error) {
    await connection.rollback();
    return fail(res, ['Prize not found', 'Prize option not found', 'Shipping address not found'].includes(error.message) ? 404 : 400, error.message);
  } finally { connection.release(); }
};

const getCartItemsForUser = async (userId, connection = db) => {
  const [rows] = await connection.query(
    `SELECT c.id, c.prize_id, c.prize_option_id, c.quantity, 'points' AS currency_type,
            p.name, p.description, p.image_url, p.cost AS prize_cost, p.stock AS prize_stock, p.delivery_type,
            o.name AS option_name, o.cost AS option_cost, o.stock AS option_stock
     FROM prize_cart_items c JOIN prizes p ON p.id = c.prize_id
     LEFT JOIN prize_options o ON o.id = c.prize_option_id
     WHERE c.user_id = ? AND p.is_deleted = 0 ORDER BY c.id`, [userId]
  );
  return rows.map((row) => ({ ...row, cost: int(row.option_cost ?? row.prize_cost), stock: int(row.option_stock ?? row.prize_stock) }));
};

const getCart = async (req, res) => ok(res, await getCartItemsForUser(req.userId));

const addCartItem = async (req, res) => {
  if ((req.body.currency_type || 'points') !== 'points') return fail(res, 400, 'Only points are supported');
  const quantity = Math.max(1, int(req.body.quantity, 1));
  const [rows] = await db.query(
    `SELECT c.id, c.quantity FROM prize_cart_items c WHERE c.user_id = ? AND c.prize_id = ? AND c.prize_option_id <=> ?`,
    [req.userId, req.body.prize_id, req.body.prize_option_id || null]
  );
  if (rows.length) await db.query('UPDATE prize_cart_items SET quantity = ?, currency_type = ? WHERE id = ?', [rows[0].quantity + quantity, 'points', rows[0].id]);
  else await db.query('INSERT INTO prize_cart_items (user_id, prize_id, prize_option_id, quantity, currency_type) VALUES (?, ?, ?, ?, ?)', [req.userId, req.body.prize_id, req.body.prize_option_id || null, quantity, 'points']);
  return ok(res, await getCartItemsForUser(req.userId), 201);
};

const updateCartItem = async (req, res) => {
  const quantity = Math.max(1, int(req.body.quantity, 1));
  await db.query('UPDATE prize_cart_items SET quantity = ?, currency_type = ? WHERE id = ? AND user_id = ?', [quantity, 'points', req.params.id, req.userId]);
  return ok(res, await getCartItemsForUser(req.userId));
};

const deleteCartItem = async (req, res) => {
  await db.query('DELETE FROM prize_cart_items WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  return ok(res, await getCartItemsForUser(req.userId));
};

const clearCart = async (req, res) => {
  await db.query('DELETE FROM prize_cart_items WHERE user_id = ?', [req.userId]);
  return ok(res, []);
};

const checkoutCart = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const cart = await getCartItemsForUser(req.userId, connection);
    if (!cart.length) throw new Error('Cart is empty');
    const orderId = await createOrder(connection, req.userId, req.body.address_id, req.body.remark);
    const redemptions = [];
    for (const item of cart) {
      redemptions.push(await createRedemptionLine(connection, req.userId, {
        orderId, prizeId: item.prize_id, prizeOptionId: item.prize_option_id,
        quantity: item.quantity, addressId: req.body.address_id, remark: req.body.remark
      }));
    }
    const pointsTotal = redemptions.reduce((sum, item) => sum + item.points_cost, 0);
    await connection.query('UPDATE prize_orders SET points_total = ? WHERE id = ?', [pointsTotal, orderId]);
    await connection.query('DELETE FROM prize_cart_items WHERE user_id = ?', [req.userId]);
    await connection.commit();
    const remainingBalances = { points: redemptions[redemptions.length - 1].remaining_points };
    return ok(res, { order_id: orderId, redemptions, points_total: pointsTotal, remainingBalances }, 201);
  } catch (error) {
    await connection.rollback();
    return fail(res, 400, error.message);
  } finally { connection.release(); }
};

const getUserRedemptions = async (req, res) => {
  const [rows] = await db.query(
    `SELECT r.*, p.name AS prize_name, o.name AS option_name FROM redemptions r
     JOIN prizes p ON p.id = r.prize_id LEFT JOIN prize_options o ON o.id = r.prize_option_id
     WHERE r.user_id = ? ORDER BY r.id DESC`, [req.userId]
  );
  ok(res, rows);
};

async function orderById(orderId, userId = null, connection = db) {
  const params = [orderId];
  const scope = userId ? ' AND user_id = ?' : '';
  if (userId) params.push(userId);
  const [orders] = await connection.query(`SELECT * FROM prize_orders WHERE id = ?${scope}`, params);
  if (!orders.length) return null;
  const [items] = await connection.query(
    `SELECT r.*, p.name AS prize_name, o.name AS option_name FROM redemptions r
     JOIN prizes p ON p.id = r.prize_id LEFT JOIN prize_options o ON o.id = r.prize_option_id
     WHERE r.order_id = ? ${userId ? 'AND r.user_id = ?' : ''} ORDER BY r.id`, params
  );
  return { ...orders[0], items };
}

const getUserPrizeOrders = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM prize_orders o WHERE o.user_id = ? ORDER BY o.id DESC', [req.userId]);
  ok(res, rows);
};
const getUserPrizeOrderById = async (req, res) => {
  const orderId = req.params.id;
  const order = await orderById(orderId, req.userId);
  if (!order) return fail(res, 404, 'Order not found');
  return ok(res, order);
};

const getShippingAddresses = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM shipping_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [req.userId]);
  ok(res, rows);
};
const createShippingAddress = async (req, res) => {
  const body = req.body;
  if (!body.recipient_name || !body.phone || !body.address_line) return fail(res, 400, 'Recipient, phone and address are required');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (body.is_default) await connection.query('UPDATE shipping_addresses SET is_default = 0 WHERE user_id = ?', [req.userId]);
    const [result] = await connection.query(
      `INSERT INTO shipping_addresses (user_id, recipient_name, phone, province, city, district, address_line, postal_code, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, body.recipient_name, body.phone, body.province || '', body.city || '', body.district || '', body.address_line, body.postal_code || '', body.is_default ? 1 : 0]
    );
    await connection.commit();
    return ok(res, { id: result.insertId }, 201);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};
const updateShippingAddress = async (req, res) => {
  const body = req.body;
  await db.query(
    `UPDATE shipping_addresses SET recipient_name = ?, phone = ?, province = ?, city = ?, district = ?, address_line = ?, postal_code = ? WHERE id = ? AND user_id = ?`,
    [body.recipient_name, body.phone, body.province || '', body.city || '', body.district || '', body.address_line, body.postal_code || '', req.params.id, req.userId]
  );
  return ok(res, { id: int(req.params.id) });
};
const setDefaultShippingAddress = async (req, res) => {
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); await connection.query('UPDATE shipping_addresses SET is_default = 0 WHERE user_id = ?', [req.userId]); await connection.query('UPDATE shipping_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.userId]); await connection.commit(); return ok(res, {}); }
  catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};
const deleteShippingAddress = async (req, res) => { await db.query('DELETE FROM shipping_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.userId]); return ok(res, {}); };

const getAdminPrizeOrders = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const params = [];
  const where = req.query.status ? (params.push(req.query.status), 'WHERE o.status = ?') : '';
  const [rows] = await db.query(`SELECT o.*, u.username, u.email FROM prize_orders o JOIN users u ON u.id = o.user_id ${where} ORDER BY o.id DESC`, params);
  return ok(res, rows);
};
const getAdminPrizeOrderById = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const order = await orderById(req.params.id);
  if (!order) return fail(res, 404, 'Order not found');
  return ok(res, order);
};

async function refundOrder(connection, order, operatedBy, reason) {
  if (order.refunded_at) return false;
  const [items] = await connection.query('SELECT * FROM redemptions WHERE order_id = ? FOR UPDATE', [order.id]);
  for (const item of items) {
    await pointsService.refundRedemption(connection, {
      userId: order.user_id, pointsCost: item.points_cost, redemptionId: item.id,
      prizeId: item.prize_id, operatedBy, reason
    });
    if (item.prize_option_id) await connection.query('UPDATE prize_options SET stock = stock + ? WHERE id = ?', [item.quantity, item.prize_option_id]);
    else await connection.query('UPDATE prizes SET stock = stock + ? WHERE id = ?', [item.quantity, item.prize_id]);
    await connection.query(`UPDATE redemptions SET status = 'refunded', refunded_at = NOW() WHERE id = ?`, [item.id]);
  }
  await connection.query('UPDATE prize_orders SET refunded_at = NOW() WHERE id = ?', [order.id]);
  return true;
}

const updateAdminPrizeOrderStatus = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const allowed = ['pending', 'processing', 'shipped', 'completed', 'cancelled', 'rejected'];
  if (!allowed.includes(req.body.status)) return fail(res, 400, 'Invalid status');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM prize_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw new Error('Order not found');
    if (['cancelled', 'rejected'].includes(req.body.status)) await refundOrder(connection, rows[0], req.userId, req.body.reason || `Order ${req.body.status}`);
    await connection.query('UPDATE prize_orders SET status = ?, status_reason = ?, updated_at = NOW() WHERE id = ?', [req.body.status, req.body.reason || null, req.params.id]);
    await connection.query('UPDATE redemptions SET status = ? WHERE order_id = ? AND status <> \'refunded\'', [req.body.status, req.params.id]);
    await connection.commit();
    return ok(res, await orderById(req.params.id));
  } catch (error) { await connection.rollback(); return fail(res, 400, error.message); } finally { connection.release(); }
};

const getAdminItems = async (req, res) => { if (!requireAdmin(req, res)) return; const [rows] = await db.query('SELECT * FROM prizes WHERE is_deleted = 0 ORDER BY sort_order, id DESC'); res.json(await hydratePrizes(rows)); };

function normalizeOptions(options = []) {
  return options.filter((item) => item.name?.trim()).map((item, index) => ({
    id: item.id || null, name: item.name.trim(), description: item.description || '', cost: Math.max(0, int(item.cost)),
    stock: Math.max(0, int(item.stock)), is_active: item.is_active === false || item.is_active === 0 ? 0 : 1, sort_order: index
  }));
}

async function replaceOptions(connection, prizeId, options) {
  const normalized = normalizeOptions(options);
  const keep = normalized.filter((item) => item.id).map((item) => int(item.id));
  if (keep.length) await connection.query(`DELETE FROM prize_options WHERE prize_id = ? AND id NOT IN (${keep.map(() => '?').join(',')})`, [prizeId, ...keep]);
  else await connection.query('DELETE FROM prize_options WHERE prize_id = ?', [prizeId]);
  for (const item of normalized) {
    if (item.id) await connection.query('UPDATE prize_options SET name = ?, description = ?, cost = ?, stock = ?, is_active = ?, sort_order = ? WHERE id = ? AND prize_id = ?', [item.name, item.description, item.cost, item.stock, item.is_active, item.sort_order, item.id, prizeId]);
    else await connection.query('INSERT INTO prize_options (prize_id, name, description, cost, stock, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [prizeId, item.name, item.description, item.cost, item.stock, item.is_active, item.sort_order]);
  }
}

const createAdminItem = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!req.body.name?.trim() || int(req.body.cost, -1) < 0) return fail(res, 400, 'Name and non-negative point cost are required');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO prizes (name, description, cost, stock, delivery_type, is_active, auto_carousel, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.body.name.trim(), req.body.description || '', int(req.body.cost), Math.max(0, int(req.body.stock)), normalizeDelivery(req.body.delivery_type), req.body.is_active === false ? 0 : 1, req.body.auto_carousel ? 1 : 0, req.body.image_url || null]
    );
    await replaceOptions(connection, result.insertId, req.body.options);
    await connection.commit();
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

const updateAdminItem = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE prizes SET name = ?, description = ?, cost = ?, stock = ?, delivery_type = ?, is_active = ?, auto_carousel = ? WHERE id = ? AND is_deleted = 0`,
      [req.body.name.trim(), req.body.description || '', int(req.body.cost), Math.max(0, int(req.body.stock)), normalizeDelivery(req.body.delivery_type), req.body.is_active === false ? 0 : 1, req.body.auto_carousel ? 1 : 0, req.params.id]
    );
    await replaceOptions(connection, req.params.id, req.body.options);
    await connection.commit();
    return res.json({ success: true });
  } catch (error) { await connection.rollback(); return fail(res, 400, error.message); } finally { connection.release(); }
};
const updateAdminItemOrder = async (req, res) => { if (!requireAdmin(req, res)) return; for (const [index, id] of (req.body.item_ids || []).entries()) await db.query('UPDATE prizes SET sort_order = ? WHERE id = ?', [index, id]); res.json({ success: true }); };
const deleteAdminItem = async (req, res) => { if (!requireAdmin(req, res)) return; await db.query('UPDATE prizes SET is_deleted = 1, is_active = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); };

const uploadAdminImages = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  for (const [index, image] of images.entries()) {
    if (!String(image.url || '').startsWith('/') && !String(image.url || '').startsWith('https://') && !String(image.url || '').startsWith('data:image/')) continue;
    await db.query('INSERT INTO prize_images (prize_id, image_url, alt_text, sort_order) VALUES (?, ?, ?, ?)', [req.params.id, image.url, image.alt_text || '', index]);
  }
  res.json({ success: true });
};
const updateAdminImageOrder = async (req, res) => { if (!requireAdmin(req, res)) return; for (const [index, id] of (req.body.image_ids || []).entries()) await db.query('UPDATE prize_images SET sort_order = ? WHERE id = ? AND prize_id = ?', [index, id, req.params.id]); res.json({ success: true }); };
const deleteAdminImage = async (req, res) => { if (!requireAdmin(req, res)) return; await db.query('DELETE FROM prize_images WHERE id = ? AND prize_id = ?', [req.params.imageId, req.params.id]); res.json({ success: true }); };

const getAdminRedemptions = async (req, res) => getAdminPrizeOrders(req, res);
const updateAdminRedemptionStatus = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const [rows] = await db.query('SELECT order_id FROM redemptions WHERE id = ?', [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Redemption not found');
  req.params.id = rows[0].order_id;
  return updateAdminPrizeOrderStatus(req, res);
};

module.exports = {
  getAllPrizes, getPrizeById, redeemPrize, getCart, addCartItem, updateCartItem, deleteCartItem, clearCart, checkoutCart,
  getUserRedemptions, getUserPrizeOrders, getUserPrizeOrderById, getShippingAddresses, createShippingAddress,
  updateShippingAddress, setDefaultShippingAddress, deleteShippingAddress, getAdminPrizeOrders, getAdminPrizeOrderById,
  updateAdminPrizeOrderStatus, getAdminItems, createAdminItem, updateAdminItem, updateAdminItemOrder, deleteAdminItem,
  uploadAdminImages, updateAdminImageOrder, deleteAdminImage, getAdminRedemptions, updateAdminRedemptionStatus
};
