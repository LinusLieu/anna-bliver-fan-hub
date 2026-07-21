const router = require('express').Router();
const controller = require('../controllers/permissionController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/types', controller.getPermissionTypes);
router.get('/my', controller.getMyPermissions);
router.get('/users', controller.getAllUsersWithPermissions);
router.get('/users/:userId', controller.getUserPermissions);
router.put('/users/:userId', controller.updateUserPermissions);

module.exports = router;
