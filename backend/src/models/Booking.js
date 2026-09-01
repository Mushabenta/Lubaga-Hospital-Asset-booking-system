const { pool } = require('../config/db');

const BOOKING_SELECT = `
  SELECT b.id, b.asset_id, a.name AS asset_name, a.code AS asset_code,
         c.name AS category,
         COALESCE((SELECT array_agg(s.specification ORDER BY s.id)
                   FROM asset_specifications s WHERE s.asset_id = a.id), '{}')
           AS asset_specifications,
         b.user_id, u.username AS requestor, u.email, u.phone, u.department AS user_department,
         b.start_time, b.end_time, b.purpose, b.status,
         b.power_code, b.power_extension, b.vga_hdmi, b.hdmi_adapter,
         b.approved_by, au.username AS approved_by_name, b.date_approved,
         b.date_given_out,
         b.returned_by, b.date_returned, b.notes, b.created_at, b.updated_at
  FROM bookings b
  JOIN assets a ON a.id = b.asset_id
  LEFT JOIN categories c ON c.id = a.category_id
  JOIN users u ON u.id = b.user_id
  LEFT JOIN users au ON au.id = b.approved_by
`;

const Booking = {
  async findById(id) {
    const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
    return rows[0] || null;
  },

  // Raw minimal record (no joins) - used for state-transition checks
  async findRawById(id) {
    const { rows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    return rows[0] || null;
  },

  // Conflicting bookings for an asset over the period, in a given transaction/client.
  // Only statuses that actually occupy the asset are considered.
  async findConflicts(assetId, startTime, endTime, excludeId, client) {
    const query = `
      SELECT id FROM bookings
      WHERE asset_id = $1
        AND status IN ('pending','approved','active')
        AND start_time < $3
        AND end_time > $2
        AND ($4::int IS NULL OR id <> $4)
    `;
    const params = [assetId, startTime, endTime, excludeId || null];
    const runner = client || pool;
    const { rows } = await runner.query(query, params);
    return rows;
  },

  // List bookings with filters. Staff see own; admins/managers see all (or by dept).
  async findAll({ userId, role, status, assetId, page = 1, limit = 100 } = {}) {
    const conditions = [];
    const params = [];

    if (role === 'staff') {
      params.push(userId);
      conditions.push(`b.user_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (assetId) {
      params.push(assetId);
      conditions.push(`b.asset_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(
      `${BOOKING_SELECT} ${where} ORDER BY b.start_time DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countWhere = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM bookings b ${countWhere}`,
      params.slice(0, conditions.length)
    );

    return { bookings: rows, total: countRows[0].count, page, limit };
  },

  async create(booking, client) {
    const runner = client || pool;
    const { rows } = await runner.query(
      `INSERT INTO bookings (asset_id, user_id, start_time, end_time, purpose, status,
                             power_code, power_extension, vga_hdmi, hdmi_adapter, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        booking.asset_id,
        booking.user_id,
        booking.start_time,
        booking.end_time,
        booking.purpose || '',
        booking.status || 'pending',
        booking.power_code || false,
        booking.power_extension || false,
        booking.vga_hdmi || 'N/A',
        booking.hdmi_adapter || false,
        booking.notes || ''
      ]
    );
    return rows[0].id;
  },

  async updateStatus(id, status, fields = {}, client) {
    const runner = client || pool;
    const set = ['status = $2', 'updated_at = NOW()'];
    const values = [id, status];
    let i = 3;
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      set.push(`${key} = $${i++}`);
      values.push(value);
    }
    await runner.query(`UPDATE bookings SET ${set.join(', ')} WHERE id = $1`, values);
    return Booking.findById(id);
  },

  async deleteById(id, client) {
    const runner = client || pool;
    const { rows } = await runner.query('DELETE FROM bookings WHERE id = $1 RETURNING id', [id]);
    return rows[0] || null;
  },

  // Dashboard statistics
  async dashboardStats({ role, userId, department }) {
    const conditions = [];
    const params = [];
    const where = () => (conditions.length ? `WHERE ${conditions.join(' AND ')}` : '');

    if (role === 'staff') {
      params.push(userId);
      conditions.push(`b.user_id = $${params.length}`);
    } else if (role === 'admin' && department) {
      params.push(department);
      conditions.push(`u.department = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE b.status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE b.status = 'approved')::int AS approved,
         COUNT(*) FILTER (WHERE b.status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE b.status = 'completed')::int AS completed,
         COUNT(*) FILTER (WHERE b.status = 'rejected')::int AS rejected,
         COUNT(*) FILTER (WHERE b.status = 'cancelled')::int AS cancelled
       FROM bookings b JOIN users u ON u.id = b.user_id ${where()}`,
      params
    );
    return rows[0];
  }
};

module.exports = Booking;
