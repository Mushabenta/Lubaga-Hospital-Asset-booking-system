const express = require('express');
const AuthController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authValidators } = require('../validators');

const router = express.Router();

router.post('/register', authValidators.register, AuthController.register);
router.post('/login', authValidators.login, AuthController.login);
router.post('/forgot-password', authValidators.forgotPassword, AuthController.forgotPassword);
router.get('/me', protect, AuthController.me);
router.post('/change-password', protect, authValidators.changePassword, AuthController.changePassword);

module.exports = router;
