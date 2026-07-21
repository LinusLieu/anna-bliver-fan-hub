const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/send-code', authController.sendVerificationCode);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', authMiddleware, authController.getProfile);
router.get('/users', authMiddleware, authController.getAllUsers);
router.put('/users/:id/role', authMiddleware, authController.updateUserRole);

module.exports = router;
