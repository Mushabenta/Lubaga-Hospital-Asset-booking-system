const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const assetRoutes = require('./asset.routes');
const bookingRoutes = require('./booking.routes');
const referenceRoutes = require('./reference.routes');
const auditRoutes = require('./audit.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/assets', assetRoutes);
router.use('/bookings', bookingRoutes);
router.use(referenceRoutes); // defines /categories and /departments at /api root
router.use('/audit-logs', auditRoutes);

module.exports = router;
