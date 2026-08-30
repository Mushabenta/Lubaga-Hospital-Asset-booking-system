const { pool } = require('../config/db');

const User = {
  async findAll() {
    const { rows } = await pool.query(
      `SELECT id, username, email, phone, role, service_element, department, active, created_at, updated_at
       FROM users ORDER BY id`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT id, username, email, phone, role, service_element, department, active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByIdWithPassword(id) {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByUsername(username) {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return rows[0] || null;
  },

  async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  },

  async findByPhone(phone) {
    const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return rows[0] || null;
  },

  async findByLogin(identifier) {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE username = $1 OR email = $1`,
      [identifier]
    );
    return rows[0] || null;
  },

  async create(user) {
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, phone, password_hash, role, service_element, department, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, email, phone, role, service_element, department, active, created_at, updated_at`,
      [
        user.username,
        user.email,
        user.phone,
        user.password_hash,
        user.role,
        user.service_element || '',
        user.department || '',
        user.active !== undefined ? user.active : true
      ]
    );
    return rows[0];
  },

  async updatePassword(id, passwordHash) {
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, username, role`,
      [passwordHash, id]
    );
    return rows[0] || null;
  },

  async toggleActive(id, active) {
    const { rows } = await pool.query(
      `UPDATE users SET active = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, username, active`,
      [active, id]
    );
    return rows[0] || null;
  },

  async updateRole(id, role) {
    const { rows } = await pool.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, username, role`,
      [role, id]
    );
    return rows[0] || null;
  },

  async updateProfile(id, fields) {
    const set = [];
    const values = [];
    let i = 1;
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      set.push(`${key} = $${i++}`);
      values.push(value);
    }
    if (set.length === 0) return User.findById(id);
    set.push(`updated_at = NOW()`);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${set.join(', ')} WHERE id = $${i}
       RETURNING id, username, email, phone, role, service_element, department, active`,
      values
    );
    return rows[0] || null;
  },

  async deleteById(id) {
    const { rows } = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    return rows[0] || null;
  },

  async countByRole(roles) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = ANY($1)`,
      [roles]
    );
    return rows[0].count;
  }
};

module.exports = User;
