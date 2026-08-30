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

let staff, admin, genAdmin;

beforeAll(async () => {
  await setupDatabase();
  await cleanAll();
  staff = await createUserClient({ username: 'staff1', role: 'staff' });
  admin = await createUserClient({ username: 'admin1', role: 'admin' });
  genAdmin = await createUserClient({ username: 'ga1', role: 'general_admin' });
});

afterAll(async () => {
  await teardown();
});

beforeEach(async () => {
  await cleanAll();
  staff = await createUserClient({ username: 'staff1', role: 'staff' });
  admin = await createUserClient({ username: 'admin1', role: 'admin' });
  genAdmin = await createUserClient({ username: 'ga1', role: 'general_admin' });
});

describe('AUTHENTICATION', () => {
  test('register a new staff user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        phone: '0781123456',
        password: 'secret123',
        serviceElement: 'Pharmacy',
        department: 'Main Pharmacy'
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('staff');
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('register rejects duplicate username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'staff1', email: 'x@example.com', phone: '0781123444', password: 'secret123', serviceElement: 'a', department: 'b' });
    expect(res.status).toBe(400);
  });

  test('register rejects weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'weakpwd', email: 'w@example.com', phone: '0791123456', password: '123', serviceElement: 'a', department: 'b' });
    expect(res.status).toBe(422);
  });

  test('login succeeds with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'staff1', password: staff.plain.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.username).toBe('staff1');
  });

  test('login fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'staff1', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('login fails for unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'whatever1' });
    expect(res.status).toBe(401);
  });

  test('login blocked for disabled account', async () => {
    const { pool } = require('./helpers');
    await pool.query(`UPDATE users SET active = $1 WHERE username = 'staff1'`, [false]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'staff1', password: staff.plain.password });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('ACCOUNT_DISABLED');
  });

  test('protected route rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('protected route rejects invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  test('/api/auth/me returns the authenticated user', async () => {
    const res = await agent(staff.token).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('staff1');
  });

  test('change password works and old password stops working', async () => {
    const res = await agent(staff.token)
      .post('/api/auth/change-password')
      .send({ currentPassword: staff.plain.password, newPassword: 'newpass123' });
    expect(res.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'staff1', password: staff.plain.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'staff1', password: 'newpass123' });
    expect(newLogin.status).toBe(200);
  });
});

describe('AUTHORIZATION (RBAC)', () => {
  test('staff cannot list all users', async () => {
    const res = await agent(staff.token).get('/api/users');
    expect(res.status).toBe(403);
  });

  test('admin can list all users', async () => {
    const res = await agent(admin.token).get('/api/users');
    expect(res.status).toBe(200);
  });

  test('staff cannot create an asset', async () => {
    const res = await agent(staff.token)
      .post('/api/assets')
      .send({ name: 'X', code: 'X-1', category_id: null });
    expect(res.status).toBe(403);
  });

  test('admin cannot delete users (general admin only)', async () => {
    const target = await createUserClient({ username: 'todelete', role: 'staff' });
    const res = await agent(admin.token).del(`/api/users/${target.user.id}`);
    expect(res.status).toBe(403);
  });

  test('general admin can delete a staff user', async () => {
    const target = await createUserClient({ username: 'todelete2', role: 'staff' });
    const res = await agent(genAdmin.token).del(`/api/users/${target.user.id}`);
    expect(res.status).toBe(200);
  });

  test('privilege escalation: client cannot set own role via register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'escalate',
        email: 'escalate@example.com',
        phone: '0788777666',
        password: 'secret123',
        serviceElement: 'a',
        department: 'b',
        role: 'general_admin'
      });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('staff');
  });
});
