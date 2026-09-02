// Pure, database-free booking business rules. Kept separate from the service
// so the overlap and state-transition logic can be unit-tested in isolation.

const BOOKABLE_ASSET_STATUSES = new Set(['available']);

// Valid onward transitions for a booking state machine.
const TRANSITIONS = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['active', 'cancelled'],
  active: ['completed'],
  rejected: [],
  cancelled: [],
  completed: []
};

const TERMINAL_STATUSES = ['rejected', 'cancelled', 'completed'];

// Half-open interval overlap test:
//   existing [aStart, aEnd) overlaps new [bStart, bEnd) if
//   aStart < bEnd  AND  bStart < aEnd
// Back-to-back periods (aEnd === bStart) are NOT a conflict and are allowed.
function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
         new Date(bStart).getTime() < new Date(aEnd).getTime();
}

// Does the new period conflict with any of a list of existing bookings?
function hasConflict(newStart, newEnd, existing) {
  return (existing || []).some((b) =>
    overlaps(b.start_time, b.end_time, newStart, newEnd)
  );
}

function validStartTime(startTime) {
  return !isNaN(new Date(startTime).getTime());
}

// Validate the requested period before any DB call.
// A short grace period (10 min) is allowed for "Book Now" so that the booking
// is not rejected because a few seconds/minutes elapsed between the form
// being populated with the current Ugandan time and the server receiving it
// (network latency / clock skew). Genuinely past bookings are still blocked.
const PAST_GRACE_MS = 10 * 60 * 1000;

function validatePeriod(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (!validStartTime(start) || !validStartTime(end)) {
    return { ok: false, code: 'INVALID_TIMES', message: 'Invalid booking start/end time' };
  }
  if (end <= start) {
    return { ok: false, code: 'END_BEFORE_START', message: 'End time must be after start time' };
  }
  if (start.getTime() < new Date().getTime() - PAST_GRACE_MS) {
    return { ok: false, code: 'PAST_BOOKING', message: 'Booking start time cannot be in the past' };
  }
  return { ok: true };
}

// Verify the asset may be booked based on its lifecycle status.
function assetBookableStatus(status) {
  return BOOKABLE_ASSET_STATUSES.has(status);
}

// Validate that a status transition is allowed.
function canTransition(current, next) {
  if (!TRANSITIONS[current]) return false;
  return TRANSITIONS[current].includes(next);
}

module.exports = {
  BOOKABLE_ASSET_STATUSES,
  TRANSITIONS,
  TERMINAL_STATUSES,
  overlaps,
  hasConflict,
  validatePeriod,
  assetBookableStatus,
  canTransition
};
