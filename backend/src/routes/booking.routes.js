const express = require('express');
const BookingController = require('../controllers/bookingController');
const { protect, adminOnly } = require('../middleware/auth');
const { bookingValidators } = require('../validators');

const router = express.Router();

// Orders matter: static sub-routes before /:id.

router.get('/stats', protect, BookingController.stats);
router.post('/availability', protect, bookingValidators.availability, BookingController.availability);

router.get('/', protect, bookingValidators.list, BookingController.list);
router.post('/', protect, bookingValidators.create, BookingController.create);

router.get('/:id', protect, bookingValidators.param, BookingController.get);
router.post('/:id/approve', protect, adminOnly, bookingValidators.param, BookingController.approve);
router.post('/:id/reject', protect, adminOnly, bookingValidators.action, BookingController.reject);
router.post('/:id/cancel', protect, bookingValidators.param, BookingController.cancel);
router.post('/:id/activate', protect, adminOnly, bookingValidators.param, BookingController.markActive);
router.post('/:id/complete', protect, adminOnly, bookingValidators.action, BookingController.complete);

module.exports = router;
