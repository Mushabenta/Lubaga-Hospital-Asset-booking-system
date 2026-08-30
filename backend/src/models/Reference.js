const { pool } = require('../config/db');

const Category = {
  async findAll() {
    const { rows } = await pool.query('SELECT id, name FROM categories ORDER BY name');
    return rows;
  },
  async findByName(name) {
    const { rows } = await pool.query('SELECT * FROM categories WHERE name = $1', [name]);
    return rows[0] || null;
  },
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    return rows[0] || null;
  },
  async create(name) {
    const { rows } = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name',
      [name]
    );
    return rows[0] || null;
  },
  async deleteById(id) {
    const { rows } = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    return rows[0] || null;
  }
};

const Department = {
  async findAll() {
    const { rows } = await pool.query(
      'SELECT id, name, service_element FROM departments ORDER BY service_element, name'
    );
    return rows;
  },
  async findByNameAndElement(name, serviceElement) {
    const { rows } = await pool.query(
      'SELECT * FROM departments WHERE name = $1 AND service_element = $2',
      [name, serviceElement]
    );
    return rows[0] || null;
  },
  async create({ name, serviceElement }) {
    const { rows } = await pool.query(
      `INSERT INTO departments (name, service_element) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING RETURNING id, name, service_element`,
      [name, serviceElement]
    );
    return rows[0] || null;
  }
};

module.exports = { Category, Department };
