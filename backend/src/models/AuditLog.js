const { pool } = require('../config/db');

const AuditLog = {
  async create({ userId = null, action, entity = '', entityId = null, details = {} }) {
    const { rows } = await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, action, entity, entityId, JSON.stringify(details)]
    );
    return rows[0];
  },

  async findAll({ page = 1, limit = 100 } = {}) {
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT al.id, al.action, al.entity, al.entity_id, al.details, al.created_at,
              u.username
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM audit_logs');
    return { logs: rows, total: countRows[0].count, page, limit };
  }
};

module.exports = AuditLog;
