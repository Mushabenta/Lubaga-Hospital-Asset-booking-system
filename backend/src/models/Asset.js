const { pool } = require('../config/db');

const ASSET_SELECT = `
  SELECT a.id, a.name, a.code, a.category_id, c.name AS category,
         a.description, a.department, a.location, a.serial_number,
         a.condition_name, a.status, a.image_url, a.created_at, a.updated_at,
    COALESCE(array_agg(s.specification ORDER BY s.id)
      FILTER (WHERE s.specification IS NOT NULL), '{}') AS specifications
  FROM assets a
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN asset_specifications s ON s.asset_id = a.id
`;

const groupAssets = async (baseSql, params) => {
  const { rows } = await pool.query(baseSql, params);
  const map = new Map();
  const result = [];
  for (const row of rows) {
    let asset = map.get(row.id);
    if (!asset) {
      asset = {
        id: row.id,
        name: row.name,
        code: row.code,
        category_id: row.category_id,
        category: row.category,
        description: row.description,
        department: row.department,
        location: row.location,
        serial_number: row.serial_number,
        condition_name: row.condition_name,
        status: row.status,
        image_url: row.image_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
        specifications: []
      };
      map.set(row.id, asset);
      result.push(asset);
    }
    if (row.specifications && row.specifications.length) {
      asset.specifications = row.specifications;
    }
  }
  return result;
};

const Asset = {
  async findAll({ search, status, categoryId, department, page = 1, limit = 100 } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.name ILIKE $${params.length} OR a.code ILIKE $${params.length} OR a.description ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`a.category_id = $${params.length}`);
    }
    if (department) {
      params.push(department);
      conditions.push(`a.department = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    params.push(limit);
    params.push(offset);

    const rows = await groupAssets(
      `${ASSET_SELECT} ${where} GROUP BY a.id, c.name ORDER BY a.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = conditions.map((c, idx) => idx + 1);
    const countWhere = conditions.length
      ? 'WHERE ' + conditions
          .map((c, idx) => c.replace(/\$\d+/g, `$${idx + 1}`))
          .join(' AND ')
      : '';
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM assets a ${countWhere}`,
      params.slice(0, countParams.length)
    );

    return { assets: rows, total: countRows[0].count, page, limit };
  },

  async findById(id) {
    const assets = await groupAssets(
      `${ASSET_SELECT} WHERE a.id = $1 GROUP BY a.id, c.name`,
      [id]
    );
    return assets[0] || null;
  },

  async findByName(name) {
    const { rows } = await pool.query('SELECT * FROM assets WHERE name = $1', [name]);
    return rows[0] || null;
  },

  async findByCode(code) {
    const { rows } = await pool.query('SELECT * FROM assets WHERE code = $1', [code]);
    return rows[0] || null;
  },

  async create(asset) {
    const { rows } = await pool.query(
      `INSERT INTO assets (name, code, category_id, description, department, location,
                           serial_number, condition_name, status, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        asset.name,
        asset.code,
        asset.category_id || null,
        asset.description || '',
        asset.department || '',
        asset.location || '',
        asset.serial_number || '',
        asset.condition_name || 'Good',
        asset.status || 'available',
        asset.image_url || ''
      ]
    );
    return Asset.findById(rows[0].id);
  },

  async update(id, fields) {
    const set = [];
    const values = [];
    let i = 1;
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      set.push(`${key} = $${i++}`);
      values.push(value);
    }
    if (set.length === 0) return Asset.findById(id);
    set.push(`updated_at = NOW()`);
    values.push(id);
    await pool.query(`UPDATE assets SET ${set.join(', ')} WHERE id = $${i}`, values);
    return Asset.findById(id);
  },

  async deleteById(id) {
    const { rows } = await pool.query('DELETE FROM assets WHERE id = $1 RETURNING id', [id]);
    return rows[0] || null;
  },

  async setSpecifications(assetId, specs) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM asset_specifications WHERE asset_id = $1', [assetId]);
      for (const spec of specs) {
        if (spec && spec.trim()) {
          await client.query(
            'INSERT INTO asset_specifications (asset_id, specification) VALUES ($1, $2)',
            [assetId, spec.trim()]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async addSpecification(assetId, spec) {
    await pool.query(
      `INSERT INTO asset_specifications (asset_id, specification) VALUES ($1, $2)
       ON CONFLICT (asset_id, specification) DO NOTHING`,
      [assetId, spec.trim()]
    );
  },

  async removeSpecification(assetId, spec) {
    const { rows } = await pool.query(
      'DELETE FROM asset_specifications WHERE asset_id = $1 AND specification = $2 RETURNING id',
      [assetId, spec]
    );
    return rows[0] || null;
  }
};

module.exports = Asset;
