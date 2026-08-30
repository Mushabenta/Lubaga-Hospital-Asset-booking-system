const { pool } = require('../config/db');
const Booking = require('../models/Booking');
const Asset = require('../models/Asset');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');
const bookingRules = require('../utils/bookingRules');

const ASSET_STATUS_BOOKABLE = bookingRules.BOOKABLE_ASSET_STATUSES;

const validateTransition = (current, next) => {
  if (!bookingRules.TRANSITIONS[current]) {
    throw new ApiError(400, `Invalid current booking status: ${current}`, 'INVALID_STATUS');
  }
  if (!bookingRules.canTransition(current, next)) {
    throw new ApiError(
      400,
      `Cannot change booking status from '${current}' to '${next}'`,
      'INVALID_TRANSITION'
    );
  }
};

const BookingService = {
  // Core booking creation. Concurrency-safe via:
  //   1. Row lock on the asset row (SELECT ... FOR UPDATE)
  //   2. An asset-scoped PostgreSQL advisory lock (serializes same-asset attempts)
  //   3. Conflict re-check inside the same transaction
  //   4. Optional DB-level GiST exclusion constraint when available
  async create(data, actor) {
    const assetId = Number(data.asset_id);
    const userId = actor.id;
    const startTime = new Date(data.start_time);
    const endTime = new Date(data.end_time);

    if (!Number.isInteger(assetId)) {
      throw new ApiError(400, 'Valid asset_id is required', 'INVALID_ASSET_ID');
    }

    const periodCheck = bookingRules.validatePeriod(startTime, endTime);
    if (!periodCheck.ok) {
      throw new ApiError(400, periodCheck.message, periodCheck.code);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Advisory lock keyed on the asset - serialises concurrent bookings
      // for the same asset so the conflict check + insert are atomic.
      await client.query('SELECT pg_advisory_xact_lock($1)', [assetId]);

      // Lock the asset row and verify it exists and is bookable.
      const assetRes = await client.query(
        'SELECT * FROM assets WHERE id = $1 FOR UPDATE',
        [assetId]
      );
      const asset = assetRes.rows[0];
      if (!asset) {
        await client.query('ROLLBACK');
        throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');
      }
      if (!ASSET_STATUS_BOOKABLE.has(asset.status)) {
        await client.query('ROLLBACK');
        const code = asset.status === 'retired' ? 'ASSET_RETIRED' : 'ASSET_UNAVAILABLE';
        throw new ApiError(409, `Asset is not bookable (status: ${asset.status})`, code);
      }

      // Check for overlapping bookings on this asset.
      const conflicts = await Booking.findConflicts(
        assetId,
        startTime,
        endTime,
        null,
        client
      );
      if (conflicts.length) {
        await client.query('ROLLBACK');
        throw new ApiError(
          409,
          'Asset is already booked during the selected period',
          'BOOKING_CONFLICT'
        );
      }

      const bookingId = await Booking.create(
        {
          asset_id: assetId,
          user_id: userId,
          start_time: startTime,
          end_time: endTime,
          purpose: data.purpose,
          status: 'pending',
          power_code: data.power_code,
          power_extension: data.power_extension,
          vga_hdmi: data.vga_hdmi,
          hdmi_adapter: data.hdmi_adapter,
          notes: data.notes
        },
        client
      );

      await client.query('COMMIT');

      await AuditLog.create({
        userId,
        action: 'BOOKING_CREATED',
        entity: 'booking',
        entityId: bookingId,
        details: { assetId, start: startTime.toISOString(), end: endTime.toISOString() }
      });

      return Booking.findById(bookingId);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw error;
    } finally {
      client.release();
    }
  },

  async list(query, actor) {
    return Booking.findAll({
      userId: actor.id,
      role: actor.role,
      status: query.status,
      assetId: query.assetId,
      page: query.page,
      limit: query.limit
    });
  },

  async get(id, actor) {
    const booking = await Booking.findRawById(id);
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

    // Staff can only access their own bookings.
    if (actor.role === 'staff' && booking.user_id !== actor.id) {
      throw new ApiError(403, 'Not authorized to view this booking', 'FORBIDDEN');
    }
    return Booking.findById(id);
  },

  async approve(id, actor) {
    const booking = await Booking.findRawById(id);
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    validateTransition(booking.status, 'approved');

    await Booking.updateStatus(id, 'approved', { approved_by: actor.id, date_approved: new Date() });
    await AuditLog.create({
      userId: actor.id,
      action: 'BOOKING_APPROVED',
      entity: 'booking',
      entityId: id
    });
    return Booking.findById(id);
  },

  async reject(id, actor, reason) {
    const booking = await Booking.findRawById(id);
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    validateTransition(booking.status, 'rejected');

    await Booking.updateStatus(id, 'rejected', { notes: reason || booking.notes });
    await AuditLog.create({
      userId: actor.id,
      action: 'BOOKING_REJECTED',
      entity: 'booking',
      entityId: id
    });
    return Booking.findById(id);
  },

  async cancel(id, actor) {
    const booking = await Booking.findRawById(id);
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

    // Staff can cancel their own; admins can cancel any.
    if (actor.role === 'staff' && booking.user_id !== actor.id) {
      throw new ApiError(403, 'Not authorized to cancel this booking', 'FORBIDDEN');
    }

    validateTransition(booking.status, 'cancelled');
    await Booking.updateStatus(id, 'cancelled', {});
    await AuditLog.create({
      userId: actor.id,
      action: 'BOOKING_CANCELLED',
      entity: 'booking',
      entityId: id
    });
    return Booking.findById(id);
  },

  async markActive(id, actor) {
    const booking = await Booking.findRawById(id);
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    validateTransition(booking.status, 'active');
    await Booking.updateStatus(id, 'active', {});
    await AuditLog.create({
      userId: actor.id,
      action: 'BOOKING_ACTIVE',
      entity: 'booking',
      entityId: id
    });
    return Booking.findById(id);
  },

  async complete(id, actor, { returnedBy, notes }) {
    const booking = await Booking.findRawById(id);
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    validateTransition(booking.status, 'completed');
    await Booking.updateStatus(id, 'completed', {
      returned_by: returnedBy || actor.username,
      date_returned: new Date(),
      notes: notes || booking.notes
    });
    await AuditLog.create({
      userId: actor.id,
      action: 'BOOKING_COMPLETED',
      entity: 'booking',
      entityId: id
    });
    return Booking.findById(id);
  },

  async stats(actor) {
    // Staff see their own; admins see all.
    if (actor.role === 'staff') {
      return Booking.dashboardStats({ role: 'staff', userId: actor.id });
    }
    return Booking.dashboardStats({ role: actor.role, userId: actor.id });
  },

  async availability(assetId, startTime, endTime) {
    const asset = await Asset.findById(assetId);
    if (!asset) throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');
    if (!ASSET_STATUS_BOOKABLE.has(asset.status)) {
      return { asset_id: assetId, status: asset.status, available: false, reason: asset.status };
    }
    const conflicts = await Booking.findConflicts(assetId, new Date(startTime), new Date(endTime), null);
    const available = conflicts.length === 0;
    return { asset_id: assetId, status: asset.status, available, conflicts: conflicts.length };
  }
};

module.exports = BookingService;
