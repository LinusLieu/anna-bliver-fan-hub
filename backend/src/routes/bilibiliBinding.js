const router = require('express').Router();
const controller = require('../controllers/bilibiliBindingController');
const auth = require('../middleware/auth');

router.use(auth);
router.post('/qr', controller.createQr);
router.get('/qr/:key', controller.pollQr);
router.get('/status', controller.getBindingStatus);
router.post('/:bilibiliUid/primary', controller.setPrimary);
router.delete('/:bilibiliUid', controller.unbind);

module.exports = router;
