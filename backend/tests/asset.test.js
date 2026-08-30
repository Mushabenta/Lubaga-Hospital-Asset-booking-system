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

let staff, admin;

beforeAll(async () => {
  await setupDatabase();
  staff = await createUserClient({ username: 'assetstaff', role: 'staff' });
  admin = await createUserClient({ username: 'assetadmin', role: 'admin' });
});

afterAll(async () => {
  await teardown();
});

beforeEach(async () => {
  await cleanAll();
  staff = await createUserClient({ username: 'assetstaff', role: 'staff' });
  admin = await createUserClient({ username: 'assetadmin', role: 'admin' });
});

describe('ASSETS', () => {
  test('admin can create an asset', async () => {
    const res = await agent(admin.token)
      .post('/api/assets')
      .send({ name: 'Projector Epson', code: 'PRJ-001', category_id: null, specifications: ['Epson EB-2150W'] });
    expect(res.status).toBe(201);
    expect(res.body.data.asset.name).toBe('Projector Epson');
    expect(res.body.data.asset.code).toBe('PRJ-001');
  });

  test('creating asset with duplicate code rejected', async () => {
    await createAsset({ name: 'Laptop A', code: 'LAP-DUP' });
    const res = await agent(admin.token)
      .post('/api/assets')
      .send({ name: 'Laptop B', code: 'LAP-DUP' });
    expect(res.status).toBe(400);
  });

  test('creating asset with duplicate name rejected', async () => {
    await createAsset({ name: 'Laptop Dupe', code: 'LAP-D1' });
    const res = await agent(admin.token)
      .post('/api/assets')
      .send({ name: 'Laptop Dupe', code: 'LAP-D2' });
    expect(res.status).toBe(400);
  });

  test('list assets and search', async () => {
    await createAsset({ name: 'Monitor LG 4K', code: 'MON-100' });
    await createAsset({ name: 'Projector Sony', code: 'PROJ-200' });

    const all = await agent(staff.token).get('/api/assets');
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBe(2);

    const search = await agent(staff.token).get('/api/assets?search=Monitor');
    expect(search.body.data.total).toBe(1);
    expect(search.body.data.assets[0].name).toBe('Monitor LG 4K');
  });

  test('filter assets by status', async () => {
    await createAsset({ name: 'Monitor A', code: 'MON-A' });
    const { pool } = require('./helpers');
    await pool.query(`UPDATE assets SET status = 'retired' WHERE code = 'MON-A'`);

    const res = await agent(staff.token).get('/api/assets?status=retired');
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.assets[0].status).toBe('retired');
  });

  test('get single asset', async () => {
    const asset = await createAsset({ name: 'Single Asset', code: 'SGL-1' });
    const res = await agent(staff.token).get(`/api/assets/${asset.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.asset.id).toBe(asset.id);
    expect(res.body.data.asset.specifications).toContain('Dell XPS 13');
  });

  test('get non-existent asset returns 404', async () => {
    const res = await agent(staff.token).get('/api/assets/999999');
    expect(res.status).toBe(404);
  });

  test('admin can update an asset', async () => {
    const asset = await createAsset({ name: 'Update Me', code: 'UPD-1' });
    const res = await agent(admin.token)
      .put(`/api/assets/${asset.id}`)
      .send({ status: 'under_maintenance', location: 'Lab 2' });
    expect(res.status).toBe(200);
    expect(res.body.data.asset.status).toBe('under_maintenance');
    expect(res.body.data.asset.location).toBe('Lab 2');
  });

  test('admin can change status via PATCH', async () => {
    const asset = await createAsset({ name: 'Status Asset', code: 'ST-1' });
    const res = await agent(admin.token)
      .patch(`/api/assets/${asset.id}/status`)
      .send({ status: 'damaged' });
    expect(res.status).toBe(200);
    expect(res.body.data.asset.status).toBe('damaged');
  });

  test('staff cannot modify an asset', async () => {
    const asset = await createAsset({ name: 'Protected', code: 'PROT-1' });
    const res = await agent(staff.token)
      .put(`/api/assets/${asset.id}`)
      .send({ status: 'damaged' });
    expect(res.status).toBe(403);
  });

  test('deleting an asset used by a booking is blocked', async () => {
    const asset = await createAsset({ name: 'In Use', code: 'INUSE-1' });
    const cur = require('./helpers');
    await cur.pool.query(
      `INSERT INTO bookings (asset_id, user_id, start_time, end_time, status)
       VALUES ($1,$2, NOW() + interval '1 day', NOW() + interval '2 day', 'pending')`,
      [asset.id, staff.user.id]
    );
    const res = await agent(admin.token).del(`/api/assets/${asset.id}`);
    expect(res.status).toBe(400);
  });

  test('admin can delete an unused asset', async () => {
    const asset = await createAsset({ name: 'Delete Me', code: 'DEL-1' });
    const res = await agent(admin.token).del(`/api/assets/${asset.id}`);
    expect(res.status).toBe(200);
    const gone = await agent(staff.token).get(`/api/assets/${asset.id}`);
    expect(gone.status).toBe(404);
  });

  test('add and remove a specification', async () => {
    const asset = await createAsset({ name: 'Spec Asset', code: 'SPEC-1' });

    const add = await agent(admin.token)
      .post(`/api/assets/${asset.id}/specifications`)
      .send({ spec: 'New Model X' });
    expect(add.status).toBe(200);
    expect(add.body.data.asset.specifications).toContain('New Model X');

    const rem = await agent(admin.token)
      .del(`/api/assets/${asset.id}/specifications`)
      .send({ spec: 'New Model X' });
    expect(rem.status).toBe(200);
    expect(rem.body.data.asset.specifications).not.toContain('New Model X');
  });
});
