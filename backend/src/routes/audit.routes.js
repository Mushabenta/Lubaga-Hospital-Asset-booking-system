const express = require('express');
const AuditController = require('../controllers/auditController');
const { protect, generalAdminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, generalAdminOnly, AuditController.list);

module.exports = router;
