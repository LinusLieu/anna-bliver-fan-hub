const router = require('express').Router();
const controller = require('../controllers/permissionController');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.use(auth);
router.get('/types', controller.getPermissionTypes);
router.get('/my', asyncHandler(controller.getMyPermissions));
router.get('/users', asyncHandler(controller.getAllUsersWithPermissions));
router.get('/users/:userId', asyncHandler(controller.getUserPermissions));
router.put('/users/:userId', asyncHandler(controller.updateUserPermissions));

module.exports = router;
