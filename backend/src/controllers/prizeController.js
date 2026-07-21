const db = require('../config/database');
const pointsService = require('../services/pointsService');
const { idList, positiveInt, stringValue } = require('../utils/validation');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const normalizeDelivery = (value) => ['physical', 'virtual'].includes(value) ? value : 'physical';
const MAX_CART_QUANTITY = 99;
const MAX_PRIZE_IMAGE_BYTES = 2 * 1024 * 1024;
const PRIZE_UPLOAD_DIRECTORY = path.join(__dirname, '..', '..', 'uploads', 'prizes');
const PRIZE_IMAGE_TYPES = {
  'image/png': { extension: 'png', matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  'image/jpeg': { extension: 'jpg', matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/webp': { extension: 'webp', matches: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
};

function normalizeAddress(body = {}) {
  return {
    recipientName: stringValue(body.recipient_name, { field: 'Recipient', required: true, max: 100 }),
    phone: stringValue(body.phone, { field: 'Phone', required: true, max: 40 }),
    province: stringValue(body.province, { field: 'Province', max: 100 }),
    city: stringValue(body.city, { field: 'City', max: 100 }),
    district: stringValue(body.district, { field: 'District', max: 100 }),
    addressLine: stringValue(body.address_line, { field: 'Address', required: true, max: 500 }),
    postalCode: stringValue(body.postal_code, { field: 'Postal code', max: 20 }),
    isDefault: Boolean(body.is_default)
  };
}

function normalizeImageUrl(value, { allowData = false, max = 500 } = {}) {
  const url = stringValue(value, { field: 'Image URL', max });
  if (!url) return '';
  const allowed = url.startsWith('/') || url.startsWith('https://') || (allowData && /^data:image\/(?:png|jpeg|webp);base64,/i.test(url));
  if (!allowed) {
    const error = new Error('Image URL must use HTTPS, a site-relative path, or an approved image data URL');
    error.status = 400;
    throw error;
  }
  return url;
}

async function persistPrizeImage(value) {
  const source = String(value || '');
  if (!source.startsWith('data:')) return normalizeImageUrl(source);

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(source);
  if (!match) {
    const error = new Error('Prize image must be a PNG, JPG or WebP image');
    error.status = 400;
    throw error;
  }
  const type = PRIZE_IMAGE_TYPES[match[1].toLowerCase()];
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_PRIZE_IMAGE_BYTES || !type.matches(buffer)) {
    const error = new Error('Prize image is invalid or exceeds 2 MB');
    error.status = 400;
    throw error;
  }

  await fs.mkdir(PRIZE_UPLOAD_DIRECTORY, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID()}.${type.extension}`;
  await fs.writeFile(path.join(PRIZE_UPLOAD_DIRECTORY, filename), buffer, { flag: 'wx' });
  return `/uploads/prizes/${filename}`;
}

async function removeStoredPrizeImage(url) {
  if (!String(url || '').startsWith('/uploads/prizes/')) return;
  const filename = path.basename(url);
  if (filename !== url.slice('/uploads/prizes/'.length)) return;
  await fs.unlink(path.join(PRIZE_UPLOAD_DIRECTORY, filename)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

function normalizeAdminPrize(body = {}) {
  return {
    name: stringValue(body.name, { field: 'Name', required: true, max: 255 }),
    description: stringValue(body.description, { field: 'Description', max: 10000 }),
    cost: positiveInt(body.cost ?? 0, { field: 'Point cost', min: 0, max: 100000000 }),
    stock: positiveInt(body.stock ?? 0, { field: 'Stock', min: 0, max: 1000000 }),
    deliveryType: normalizeDelivery(body.delivery_type),
    isActive: body.is_active === false || body.is_active === 0 ? 0 : 1,
    autoCarousel: body.auto_carousel ? 1 : 0,
    imageUrl: normalizeImageUrl(body.image_url)
  };
}

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
  const safeAddressId = positiveInt(addressId, { field: 'Shipping address ID' });
  const [rows] = await connection.query('SELECT * FROM shipping_addresses WHERE id = ? AND user_id = ?', [safeAddressId, userId]);
  if (!rows.length) throw new Error('Shipping address not found');
  return rows[0];
}

const createRedemptionLine = async (connection, userId, lineInput) => {
  const quantity = positiveInt(lineInput.quantity ?? 1, { field: 'Quantity', max: MAX_CART_QUANTITY });
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
    [lineInput.orderId, userId, prize.id, option?.id || null, quantity, totalCost, unitCost, lineInput.addressId || null, stringValue(lineInput.remark, { field: 'Remark', max: 500 })]
  );
  const pointResult = await pointsService.recordRedemption(connection, userId, totalCost, redemptionResult.insertId, prize.id, 'points');
  if (option) await connection.query('UPDATE prize_options SET stock = stock - ? WHERE id = ?', [quantity, option.id]);
  else await connection.query('UPDATE prizes SET stock = stock - ? WHERE id = ?', [quantity, prize.id]);
  return { id: redemptionResult.insertId, prize_id: prize.id, prize_name: prize.name, option_name: option?.name || '', quantity, unit_cost: unitCost, points_cost: totalCost, remaining_points: pointResult.after };
};

async function createOrder(connection, userId, addressId, remark) {
  const address = await addressSnapshot(connection, userId, addressId);
  const safeRemark = stringValue(remark, { field: 'Remark', max: 500 });
  const [result] = await connection.query(
    `INSERT INTO prize_orders
     (user_id, status, recipient_name, phone, province, city, district, address_line, postal_code, remark)
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, address?.recipient_name || null, address?.phone || null, address?.province || null, address?.city || null,
      address?.district || null, address?.address_line || null, address?.postal_code || null, safeRemark]
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
  const quantity = positiveInt(req.body.quantity ?? 1, { field: 'Quantity', max: MAX_CART_QUANTITY });
  const prizeId = positiveInt(req.body.prize_id, { field: 'Prize ID' });
  const optionId = req.body.prize_option_id == null ? null : positiveInt(req.body.prize_option_id, { field: 'Prize option ID' });
  const [available] = await db.query(
    `SELECT p.id, o.id AS option_id FROM prizes p
     LEFT JOIN prize_options o ON o.id = ? AND o.prize_id = p.id AND o.is_active = 1
     WHERE p.id = ? AND p.is_deleted = 0 AND p.is_active = 1`,
    [optionId, prizeId]
  );
  if (!available.length || (optionId && !available[0].option_id)) return fail(res, 404, 'Prize or option not found');
  const [rows] = await db.query(
    `SELECT c.id, c.quantity FROM prize_cart_items c WHERE c.user_id = ? AND c.prize_id = ? AND c.prize_option_id <=> ?`,
    [req.userId, prizeId, optionId]
  );
  if (rows.length) {
    const nextQuantity = positiveInt(Number(rows[0].quantity) + quantity, { field: 'Quantity', max: MAX_CART_QUANTITY });
    await db.query('UPDATE prize_cart_items SET quantity = ?, currency_type = ? WHERE id = ?', [nextQuantity, 'points', rows[0].id]);
  } else {
    await db.query('INSERT INTO prize_cart_items (user_id, prize_id, prize_option_id, quantity, currency_type) VALUES (?, ?, ?, ?, ?)', [req.userId, prizeId, optionId, quantity, 'points']);
  }
  return ok(res, await getCartItemsForUser(req.userId), 201);
};

const updateCartItem = async (req, res) => {
  const quantity = positiveInt(req.body.quantity, { field: 'Quantity', max: MAX_CART_QUANTITY });
  const cartItemId = positiveInt(req.params.id, { field: 'Cart item ID' });
  await db.query('UPDATE prize_cart_items SET quantity = ?, currency_type = ? WHERE id = ? AND user_id = ?', [quantity, 'points', cartItemId, req.userId]);
  return ok(res, await getCartItemsForUser(req.userId));
};

const deleteCartItem = async (req, res) => {
  const cartItemId = positiveInt(req.params.id, { field: 'Cart item ID' });
  await db.query('DELETE FROM prize_cart_items WHERE id = ? AND user_id = ?', [cartItemId, req.userId]);
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
  const body = normalizeAddress(req.body);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (body.isDefault) await connection.query('UPDATE shipping_addresses SET is_default = 0 WHERE user_id = ?', [req.userId]);
    const [result] = await connection.query(
      `INSERT INTO shipping_addresses (user_id, recipient_name, phone, province, city, district, address_line, postal_code, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, body.recipientName, body.phone, body.province, body.city, body.district, body.addressLine, body.postalCode, body.isDefault ? 1 : 0]
    );
    await connection.commit();
    return ok(res, { id: result.insertId }, 201);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};
const updateShippingAddress = async (req, res) => {
  const body = normalizeAddress(req.body);
  const addressId = positiveInt(req.params.id, { field: 'Shipping address ID' });
  await db.query(
    `UPDATE shipping_addresses SET recipient_name = ?, phone = ?, province = ?, city = ?, district = ?, address_line = ?, postal_code = ? WHERE id = ? AND user_id = ?`,
    [body.recipientName, body.phone, body.province, body.city, body.district, body.addressLine, body.postalCode, addressId, req.userId]
  );
  return ok(res, { id: addressId });
};
const setDefaultShippingAddress = async (req, res) => {
  const addressId = positiveInt(req.params.id, { field: 'Shipping address ID' });
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); await connection.query('UPDATE shipping_addresses SET is_default = 0 WHERE user_id = ?', [req.userId]); await connection.query('UPDATE shipping_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [addressId, req.userId]); await connection.commit(); return ok(res, {}); }
  catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};
const deleteShippingAddress = async (req, res) => { const addressId = positiveInt(req.params.id, { field: 'Shipping address ID' }); await db.query('DELETE FROM shipping_addresses WHERE id = ? AND user_id = ?', [addressId, req.userId]); return ok(res, {}); };

const getAdminPrizeOrders = async (req, res) => {
  const params = [];
  const allowedStatuses = ['pending', 'processing', 'shipped', 'completed', 'cancelled', 'rejected'];
  if (req.query.status && !allowedStatuses.includes(req.query.status)) return fail(res, 400, 'Invalid status');
  const where = req.query.status ? (params.push(req.query.status), 'WHERE o.status = ?') : '';
  const [rows] = await db.query(`SELECT o.*, u.username, u.email FROM prize_orders o JOIN users u ON u.id = o.user_id ${where} ORDER BY o.id DESC`, params);
  return ok(res, rows);
};
const getAdminPrizeOrderById = async (req, res) => {
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
  const allowed = ['pending', 'processing', 'shipped', 'completed', 'cancelled', 'rejected'];
  if (!allowed.includes(req.body.status)) return fail(res, 400, 'Invalid status');
  const reason = stringValue(req.body.reason, { field: 'Status reason', max: 500 });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM prize_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw new Error('Order not found');
    if (['cancelled', 'rejected'].includes(req.body.status)) await refundOrder(connection, rows[0], req.userId, reason || `Order ${req.body.status}`);
    await connection.query('UPDATE prize_orders SET status = ?, status_reason = ?, updated_at = NOW() WHERE id = ?', [req.body.status, reason || null, req.params.id]);
    await connection.query('UPDATE redemptions SET status = ? WHERE order_id = ? AND status <> \'refunded\'', [req.body.status, req.params.id]);
    await connection.commit();
    return ok(res, await orderById(req.params.id));
  } catch (error) { await connection.rollback(); return fail(res, 400, error.message); } finally { connection.release(); }
};

const getAdminItems = async (req, res) => { const [rows] = await db.query('SELECT * FROM prizes WHERE is_deleted = 0 ORDER BY sort_order, id DESC'); res.json(await hydratePrizes(rows)); };

function normalizeOptions(options = []) {
  if (!Array.isArray(options)) return [];
  if (options.length > 50) {
    const error = new Error('A prize can contain at most 50 options');
    error.status = 400;
    throw error;
  }
  return options.filter((item) => String(item?.name || '').trim()).map((item, index) => ({
    id: item.id ? positiveInt(item.id, { field: 'Option ID' }) : null,
    name: stringValue(item.name, { field: 'Option name', required: true, max: 255 }),
    description: stringValue(item.description, { field: 'Option description', max: 10000 }),
    cost: positiveInt(item.cost ?? 0, { field: 'Option cost', min: 0, max: 100000000 }),
    stock: positiveInt(item.stock ?? 0, { field: 'Option stock', min: 0, max: 1000000 }),
    is_active: item.is_active === false || item.is_active === 0 ? 0 : 1,
    sort_order: index
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
  const item = normalizeAdminPrize(req.body);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO prizes (name, description, cost, stock, delivery_type, is_active, auto_carousel, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.name, item.description, item.cost, item.stock, item.deliveryType, item.isActive, item.autoCarousel, item.imageUrl || null]
    );
    await replaceOptions(connection, result.insertId, req.body.options);
    await connection.commit();
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

const updateAdminItem = async (req, res) => {
  const item = normalizeAdminPrize(req.body);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE prizes SET name = ?, description = ?, cost = ?, stock = ?, delivery_type = ?, is_active = ?, auto_carousel = ? WHERE id = ? AND is_deleted = 0`,
      [item.name, item.description, item.cost, item.stock, item.deliveryType, item.isActive, item.autoCarousel, positiveInt(req.params.id, { field: 'Prize ID' })]
    );
    await replaceOptions(connection, positiveInt(req.params.id, { field: 'Prize ID' }), req.body.options);
    await connection.commit();
    return res.json({ success: true });
  } catch (error) { await connection.rollback(); return fail(res, 400, error.message); } finally { connection.release(); }
};
const updateAdminItemOrder = async (req, res) => { const itemIds = idList(req.body.item_ids, { field: 'Prize IDs', max: 200 }); for (const [index, id] of itemIds.entries()) await db.query('UPDATE prizes SET sort_order = ? WHERE id = ?', [index, id]); res.json({ success: true }); };
const deleteAdminItem = async (req, res) => { await db.query('UPDATE prizes SET is_deleted = 1, is_active = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); };

const uploadAdminImages = async (req, res) => {
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 20) : [];
  const storedUrls = [];
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const [index, image] of images.entries()) {
      const imageUrl = await persistPrizeImage(image.url);
      const altText = stringValue(image.alt_text, { field: 'Image alternative text', max: 255 });
      if (!imageUrl) continue;
      storedUrls.push(imageUrl);
      await connection.query('INSERT INTO prize_images (prize_id, image_url, alt_text, sort_order) VALUES (?, ?, ?, ?)', [positiveInt(req.params.id, { field: 'Prize ID' }), imageUrl, altText, index]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await Promise.all(storedUrls.map(removeStoredPrizeImage));
    throw error;
  } finally {
    connection.release();
  }
  res.json({ success: true });
};
const updateAdminImageOrder = async (req, res) => { const imageIds = idList(req.body.image_ids, { field: 'Image IDs', max: 50 }); for (const [index, id] of imageIds.entries()) await db.query('UPDATE prize_images SET sort_order = ? WHERE id = ? AND prize_id = ?', [index, id, positiveInt(req.params.id, { field: 'Prize ID' })]); res.json({ success: true }); };
const deleteAdminImage = async (req, res) => {
  const imageId = positiveInt(req.params.imageId, { field: 'Image ID' });
  const prizeId = positiveInt(req.params.id, { field: 'Prize ID' });
  const [rows] = await db.query('SELECT image_url FROM prize_images WHERE id = ? AND prize_id = ?', [imageId, prizeId]);
  await db.query('DELETE FROM prize_images WHERE id = ? AND prize_id = ?', [imageId, prizeId]);
  if (rows[0]) await removeStoredPrizeImage(rows[0].image_url);
  res.json({ success: true });
};

const getAdminRedemptions = async (req, res) => getAdminPrizeOrders(req, res);
const updateAdminRedemptionStatus = async (req, res) => {
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

module.exports.__test__ = { MAX_CART_QUANTITY, normalizeAddress, normalizeAdminPrize, persistPrizeImage };
