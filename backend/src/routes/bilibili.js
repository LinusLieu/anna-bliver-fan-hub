const router = require('express').Router();
const controller = require('../controllers/bilibiliController');

router.get('/info', controller.getBilibiliInfo);

module.exports = router;
