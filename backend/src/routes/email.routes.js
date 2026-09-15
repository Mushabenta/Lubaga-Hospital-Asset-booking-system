const express = require('express');
const EmailController = require('../controllers/emailController');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/status', protect, adminOnly, EmailController.status);
router.post('/test', protect, adminOnly, EmailController.test);

module.exports = router;