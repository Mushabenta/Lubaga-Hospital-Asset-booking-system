const express = require('express');
const UserController = require('../controllers/userController');
const { protect, adminOnly, generalAdminOnly } = require('../middleware/auth');
const { userValidators } = require('../validators');

const router = express.Router();

router.get('/', protect, adminOnly, UserController.list);
router.post('/', protect, adminOnly, userValidators.createAdmin, UserController.createAdmin);
router.put('/:id/toggle', protect, adminOnly, userValidators.toggle, UserController.toggleActive);
router.delete('/:id', protect, generalAdminOnly, userValidators.delete, UserController.remove);

module.exports = router;
