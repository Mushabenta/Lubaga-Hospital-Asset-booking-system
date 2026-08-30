const {
  overlaps,
  hasConflict,
  validatePeriod,
  assetBookableStatus,
  canTransition,
  TRANSITIONS
} = require('../src/utils/bookingRules');

describe('bookingRules.overlaps', () => {
  test('true conflict: new starts inside existing', () => {
    // existing 10:00-12:00, new 11:00-13:00
    expect(overlaps('2026-01-01T10:00', '2026-01-01T12:00', '2026-01-01T11:00', '2026-01-01T13:00')).toBe(true);
  });

  test('true conflict: new completely inside existing', () => {
    expect(overlaps('2026-01-01T10:00', '2026-01-01T14:00', '2026-01-01T11:00', '2026-01-01T12:00')).toBe(true);
  });

  test('true conflict: existing completely inside new', () => {
    expect(overlaps('2026-01-01T11:00', '2026-01-01T12:00', '2026-01-01T10:00', '2026-01-01T14:00')).toBe(true);
  });

  test('true conflict: new starts before existing and ends after existing starts', () => {
    expect(overlaps('2026-01-01T11:00', '2026-01-01T12:00', '2026-01-01T10:30', '2026-01-01T11:30')).toBe(true);
  });

  test('back-to-back is NOT a conflict (aEnd === bStart)', () => {
    // existing 10:00-12:00, new 12:00-14:00 -> allowed
    expect(overlaps('2026-01-01T10:00', '2026-01-01T12:00', '2026-01-01T12:00', '2026-01-01T14:00')).toBe(false);
  });

  test('back-to-back reversed is NOT a conflict (bEnd === aStart)', () => {
    expect(overlaps('2026-01-01T10:00', '2026-01-01T12:00', '2026-01-01T08:00', '2026-01-01T10:00')).toBe(false);
  });

  test('fully disjoint periods are NOT a conflict', () => {
    expect(overlaps('2026-01-01T10:00', '2026-01-01T12:00', '2026-01-01T13:00', '2026-01-01T14:00')).toBe(false);
  });

  test('adjacent non-overlapping within existing gap is allowed', () => {
    expect(overlaps('2026-01-01T09:00', '2026-01-01T10:00', '2026-01-01T10:00', '2026-01-01T11:00')).toBe(false);
  });
});

describe('bookingRules.hasConflict', () => {
  const existing = [
    { start_time: '2026-01-01T10:00', end_time: '2026-01-01T12:00' },
    { start_time: '2026-01-01T15:00', end_time: '2026-01-01T17:00' }
  ];

  test('detects conflict with one of the existing bookings', () => {
    expect(hasConflict('2026-01-01T11:00', '2026-01-01T13:00', existing)).toBe(true);
    expect(hasConflict('2026-01-01T16:00', '2026-01-01T18:00', existing)).toBe(true);
  });

  test('no conflict for a free window', () => {
    expect(hasConflict('2026-01-01T12:00', '2026-01-01T15:00', existing)).toBe(false);
    expect(hasConflict('2026-01-01T13:00', '2026-01-01T14:00', existing)).toBe(false);
  });
});

describe('bookingRules.validatePeriod', () => {
  const futureStart = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
  const futureEnd = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
  const pastStart = new Date(Date.now() - 3600 * 1000).toISOString();
  const afterStart = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

  test('valid future period passes', () => {
    const r = validatePeriod(futureStart, futureEnd);
    expect(r.ok).toBe(true);
  });

  test('non-date values fail', () => {
    expect(validatePeriod('not-a-date', futureEnd).ok).toBe(false);
    expect(validatePeriod(futureStart, 'also-not-a-date').ok).toBe(false);
  });

  test('end before start fails', () => {
    expect(validatePeriod(futureEnd, futureStart).ok).toBe(false);
  });

  test('equal start/end fails', () => {
    expect(validatePeriod(futureStart, futureStart).ok).toBe(false);
  });

  test('past start fails', () => {
    const r = validatePeriod(pastStart, afterStart);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('PAST_BOOKING');
  });
});

describe('bookingRules.assetBookableStatus', () => {
  test('only available is bookable', () => {
    expect(assetBookableStatus('available')).toBe(true);
    expect(assetBookableStatus('under_maintenance')).toBe(false);
    expect(assetBookableStatus('damaged')).toBe(false);
    expect(assetBookableStatus('retired')).toBe(false);
    expect(assetBookableStatus('unavailable')).toBe(false);
  });
});

describe('bookingRules state machine', () => {
  test('defines the expected transitions', () => {
    expect(TRANSITIONS.pending).toEqual(['approved', 'rejected', 'cancelled']);
    expect(TRANSITIONS.approved).toEqual(['active', 'cancelled']);
    expect(TRANSITIONS.active).toEqual(['completed']);
  });

  test('allows valid transitions', () => {
    expect(canTransition('pending', 'approved')).toBe(true);
    expect(canTransition('pending', 'rejected')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('approved', 'active')).toBe(true);
    expect(canTransition('approved', 'cancelled')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
  });

  test('blocks invalid and backwards transitions', () => {
    expect(canTransition('approved', 'pending')).toBe(false);
    expect(canTransition('completed', 'pending')).toBe(false);
    expect(canTransition('pending', 'active')).toBe(false);
    expect(canTransition('active', 'cancelled')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
  });
});
