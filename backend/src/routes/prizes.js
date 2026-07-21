const express = require('express');
const router = express.Router();
const prizeController = require('../controllers/prizeController');
const authMiddleware = require('../middleware/auth');

router.get('/admin/items', authMiddleware, prizeController.getAdminItems);
router.post('/admin/items', authMiddleware, prizeController.createAdminItem);
router.put('/admin/items/order', authMiddleware, prizeController.updateAdminItemOrder);
router.put('/admin/items/:id', authMiddleware, prizeController.updateAdminItem);
router.delete('/admin/items/:id', authMiddleware, prizeController.deleteAdminItem);
router.post('/admin/items/:id/images', authMiddleware, prizeController.uploadAdminImages);
router.put('/admin/items/:id/images/order', authMiddleware, prizeController.updateAdminImageOrder);
router.delete('/admin/items/:id/images/:imageId', authMiddleware, prizeController.deleteAdminImage);
router.get('/admin/orders', authMiddleware, prizeController.getAdminPrizeOrders);
router.get('/admin/orders/:id', authMiddleware, prizeController.getAdminPrizeOrderById);
router.put('/admin/orders/:id/status', authMiddleware, prizeController.updateAdminPrizeOrderStatus);
router.get('/admin/redemptions', authMiddleware, prizeController.getAdminRedemptions);
router.put('/admin/redemptions/:id/status', authMiddleware, prizeController.updateAdminRedemptionStatus);

router.get('/user/orders', authMiddleware, prizeController.getUserPrizeOrders);
router.get('/user/orders/:id', authMiddleware, prizeController.getUserPrizeOrderById);
router.get('/user/redemptions', authMiddleware, prizeController.getUserRedemptions);
router.get('/shipping-addresses', authMiddleware, prizeController.getShippingAddresses);
router.post('/shipping-addresses', authMiddleware, prizeController.createShippingAddress);
router.put('/shipping-addresses/:id', authMiddleware, prizeController.updateShippingAddress);
router.put('/shipping-addresses/:id/default', authMiddleware, prizeController.setDefaultShippingAddress);
router.delete('/shipping-addresses/:id', authMiddleware, prizeController.deleteShippingAddress);
router.get('/cart', authMiddleware, prizeController.getCart);
router.post('/cart/items', authMiddleware, prizeController.addCartItem);
router.put('/cart/items/:id', authMiddleware, prizeController.updateCartItem);
router.delete('/cart/items/:id', authMiddleware, prizeController.deleteCartItem);
router.delete('/cart', authMiddleware, prizeController.clearCart);
router.post('/cart/checkout', authMiddleware, prizeController.checkoutCart);
router.post('/redeem', authMiddleware, prizeController.redeemPrize);
router.get('/', prizeController.getAllPrizes);
router.get('/:id', prizeController.getPrizeById);

module.exports = router;
