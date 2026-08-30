const {
  app,
  setupDatabase,
  cleanAll,
  teardown,
  createUserClient,
  createAsset,
  agent
} = require('./helpers');

const request = require('supertest');

let staffA, staffB, admin, asset;

const start = (hoursFromNow) =>
  new Date(Date.now() + hoursFromNow * 3600 * 1000).toISOString();

beforeAll(async () => {
  await setupDatabase();
  staffA = await createUserClient({ username: 'bookstaffa', role: 'staff' });
  staffB = await createUserClient({ username: 'bookstaffb', role: 'staff' });
  admin = await createUserClient({ username: 'bookadmin', role: 'admin' });
  asset = await createAsset({ name: 'Camera HD', code: 'CAM-001' });
});

afterAll(async () => {
  await teardown();
});

beforeEach(async () => {
  await cleanAll();
  staffA = await createUserClient({ username: 'bookstaffa', role: 'staff' });
  staffB = await createUserClient({ username: 'bookstaffb', role: 'staff' });
  admin = await createUserClient({ username: 'bookadmin', role: 'admin' });
  asset = await createAsset({ name: 'Camera HD', code: 'CAM-001' });
});

const book = (token, assetId, s, e, extra = {}) =>
  agent(token).post('/api/bookings').send({ asset_id: assetId, start_time: s, end_time: e, ...extra });

describe('BOOKINGS - creation validation', () => {
  test('successful booking returns 201 pending', async () => {
    const res = await book(staffA.token, asset.id, start(24), start(26));
    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('pending');
    expect(res.body.data.booking.asset_name).toBe('Camera HD');
  });

  test('end before start rejected', async () => {
    const res = await book(staffA.token, asset.id, start(26), start(24));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('END_BEFORE_START');
  });

  test('past start time rejected', async () => {
    const res = await book(staffA.token, asset.id, start(-2), start(2));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PAST_BOOKING');
  });

  test('nonexistent asset rejected', async () => {
    const res = await book(staffA.token, 999999, start(24), start(26));
    expect(res.status).toBe(404);
  });
});

describe('BOOKINGS - overlap prevention', () => {
  test('overlapping booking rejected with BOOKING_CONFLICT', async () => {
    await book(staffA.token, asset.id, start(24), start(26));
    // second user tries to book overlapping period
    const res = await book(staffB.token, asset.id, start(25), start(27));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('BOOKING_CONFLICT');
  });

  test('exact same period rejected', async () => {
    await book(staffA.token, asset.id, start(24), start(26));
    const res = await book(staffB.token, asset.id, start(24), start(26));
    expect(res.status).toBe(409);
  });

  test('new period fully inside existing rejected', async () => {
    await book(staffA.token, asset.id, start(24), start(30));
    const res = await book(staffB.token, asset.id, start(25), start(26));
    expect(res.status).toBe(409);
  });

  test('existing inside new rejected', async () => {
    await book(staffA.token, asset.id, start(25), start(26));
    const res = await book(staffB.token, asset.id, start(24), start(30));
    expect(res.status).toBe(409);
  });

  test('back-to-back periods are allowed', async () => {
    await book(staffA.token, asset.id, start(24), start(26));
    const res = await book(staffB.token, asset.id, start(26), start(28));
    expect(res.status).toBe(201);
  });

  test('disjoint periods are allowed', async () => {
    await book(staffA.token, asset.id, start(24), start(26));
    const res = await book(staffB.token, asset.id, start(30), start(32));
    expect(res.status).toBe(201);
  });
});

describe('BOOKINGS - asset bookability', () => {
  test('booking under-maintenance asset rejected', async () => {
    const { pool } = require('./helpers');
    await pool.query(`UPDATE assets SET status = 'under_maintenance' WHERE id = $1`, [asset.id]);
    const res = await book(staffA.token, asset.id, start(24), start(26));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ASSET_UNAVAILABLE');
  });

  test('booking retired asset rejected', async () => {
    const { pool } = require('./helpers');
    await pool.query(`UPDATE assets SET status = 'retired' WHERE id = $1`, [asset.id]);
    const res = await book(staffA.token, asset.id, start(24), start(26));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ASSET_RETIRED');
  });
});

describe('BOOKINGS - workflow & state transitions', () => {
  test('staff can cancel own pending booking', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    const res = await agent(staffA.token).post(`/api/bookings/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('cancelled');
  });

  test('staff cannot cancel another user booking', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    const res = await agent(staffB.token).post(`/api/bookings/${id}/cancel`);
    expect(res.status).toBe(403);
  });

  test('admin can cancel any booking', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    const res = await agent(admin.token).post(`/api/bookings/${id}/cancel`);
    expect(res.status).toBe(200);
  });

  test('approve then activate then complete follows transitions', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;

    const approve = await agent(admin.token).post(`/api/bookings/${id}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.booking.status).toBe('approved');
    expect(approve.body.data.booking.approved_by_name).toBe('bookadmin');

    const activate = await agent(admin.token).post(`/api/bookings/${id}/activate`);
    expect(activate.status).toBe(200);
    expect(activate.body.data.booking.status).toBe('active');

    const complete = await agent(admin.token).post(`/api/bookings/${id}/complete`).send({ returned_by: 'bookadmin', notes: 'returned' });
    expect(complete.status).toBe(200);
    expect(complete.body.data.booking.status).toBe('completed');
  });

  test('reject pending booking', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    const res = await agent(admin.token).post(`/api/bookings/${id}/reject`).send({ reason: 'no stock' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('rejected');
  });

  test('invalid transition blocked (completed -> cancelled)', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    await agent(admin.token).post(`/api/bookings/${id}/approve`);
    await agent(admin.token).post(`/api/bookings/${id}/activate`);
    await agent(admin.token).post(`/api/bookings/${id}/complete`);
    const res = await agent(admin.token).post(`/api/bookings/${id}/cancel`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_TRANSITION');
  });

  test('pending -> active (skipping approve) blocked', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    const res = await agent(admin.token).post(`/api/bookings/${id}/activate`);
    expect(res.status).toBe(400);
  });

  test('staff cannot approve a booking', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    const res = await agent(staffA.token).post(`/api/bookings/${id}/approve`);
    expect(res.status).toBe(403);
  });
});

describe('BOOKINGS - scoping', () => {
  test('staff only sees own bookings', async () => {
    await book(staffA.token, asset.id, start(24), start(26));
    await book(staffB.token, asset.id, start(30), start(32));
    const mine = await agent(staffA.token).get('/api/bookings');
    expect(mine.body.data.total).toBe(1);
  });

  test('admin sees all bookings', async () => {
    await book(staffA.token, asset.id, start(24), start(26));
    await book(staffB.token, asset.id, start(30), start(32));
    const all = await agent(admin.token).get('/api/bookings');
    expect(all.body.data.total).toBe(2);
  });

  test('staff cannot view another user booking detail', async () => {
    const created = await book(staffA.token, asset.id, start(24), start(26));
    const id = created.body.data.booking.id;
    const res = await agent(staffB.token).get(`/api/bookings/${id}`);
    expect(res.status).toBe(403);
  });
});

describe('BOOKINGS - availability endpoint', () => {
  test('reports availability correctly', async () => {
    await book(staffA.token, asset.id, start(24), start(26));

    const free = await agent(staffB.token)
      .post('/api/bookings/availability')
      .send({ asset_id: asset.id, start_time: start(30), end_time: start(32) });
    expect(free.body.data.available).toBe(true);

    const taken = await agent(staffB.token)
      .post('/api/bookings/availability')
      .send({ asset_id: asset.id, start_time: start(25), end_time: start(27) });
    expect(taken.body.data.available).toBe(false);
  });
});

describe('BOOKINGS - concurrency', () => {
  test('concurrent conflicting bookings: only one succeeds', async () => {
    const attempts = await Promise.all([
      book(staffA.token, asset.id, start(24), start(26)),
      book(staffB.token, asset.id, start(24), start(26)),
      book(staffA.token, asset.id, start(24), start(26)),
      book(staffB.token, asset.id, start(25), start(26))
    ]);

    const statuses = attempts.map((r) => r.status);
    const created = statuses.filter((s) => s === 201).length;
    const conflicts = statuses.filter((s) => s === 409).length;

    // Overlapping periods for the same asset -> exactly one successful booking.
    expect(created).toBe(1);
    expect(conflicts).toBe(3);
  });

  test('concurrent disjoint bookings all succeed', async () => {
    const attempts = await Promise.all(
      [24, 28, 32, 36].map((h) => book(staffA.token, asset.id, start(h), start(h + 2)))
    );
    const statuses = attempts.map((r) => r.status);
    expect(statuses.every((s) => s === 201)).toBe(true);
  });
});
