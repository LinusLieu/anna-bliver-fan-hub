const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');

router.get('/captcha', settingsController.getCaptchaConfig);
router.get('/registration', settingsController.getRegistrationStatus);
router.get('/site', settingsController.getSiteConfig);
router.put('/registration', authMiddleware, settingsController.updateRegistrationStatus);
router.put('/site', authMiddleware, settingsController.updateSiteConfig);

module.exports = router;
