const BookingService = require('../services/bookingService');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../middleware/error');

const BookingController = {
  create: asyncHandler(async (req, res) => {
    const booking = await BookingService.create(req.body, req.user);
    success(res, { booking }, 'Booking created successfully', 201);
  }),

  list: asyncHandler(async (req, res) => {
    const data = await BookingService.list({
      status: req.query.status,
      assetId: req.query.assetId,
      page: req.query.page,
      limit: req.query.limit
    }, req.user);
    success(res, data);
  }),

  get: asyncHandler(async (req, res) => {
    const booking = await BookingService.get(req.params.id, req.user);
    success(res, { booking });
  }),

  approve: asyncHandler(async (req, res) => {
    const booking = await BookingService.approve(req.params.id, req.user);
    success(res, { booking }, 'Booking approved');
  }),

  reject: asyncHandler(async (req, res) => {
    const booking = await BookingService.reject(req.params.id, req.user, req.body.reason);
    success(res, { booking }, 'Booking rejected');
  }),

  cancel: asyncHandler(async (req, res) => {
    const booking = await BookingService.cancel(req.params.id, req.user);
    success(res, { booking }, 'Booking cancelled');
  }),

  markActive: asyncHandler(async (req, res) => {
    const booking = await BookingService.markActive(req.params.id, req.user);
    success(res, { booking }, 'Booking marked as active');
  }),

  complete: asyncHandler(async (req, res) => {
    const booking = await BookingService.complete(req.params.id, req.user, req.body);
    success(res, { booking }, 'Booking completed');
  }),

  stats: asyncHandler(async (req, res) => {
    const stats = await BookingService.stats(req.user);
    success(res, { stats });
  }),

  availability: asyncHandler(async (req, res) => {
    const result = await BookingService.availability(
      req.body.asset_id,
      req.body.start_time,
      req.body.end_time
    );
    success(res, result);
  })
};

module.exports = BookingController;
