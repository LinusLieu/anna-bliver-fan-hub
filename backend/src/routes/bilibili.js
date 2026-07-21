const router = require('express').Router();
const controller = require('../controllers/bilibiliController');
const asyncHandler = require('../utils/asyncHandler');

router.get('/info', asyncHandler(controller.getBilibiliInfo));

module.exports = router;
