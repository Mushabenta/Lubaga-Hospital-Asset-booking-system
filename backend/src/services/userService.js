const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  phone: user.phone,
  role: user.role,
  service_element: user.service_element,
  department: user.department,
  active: user.active,
  created_at: user.created_at,
  updated_at: user.updated_at
});

const UserService = {
  async list() {
    const users = await User.findAll();
    return users.map(sanitizeUser);
  },

  // Admin creates another admin account.
  async createAdmin({ username, email, phone, password, serviceElement, department }, actor) {
    username = String(username || '').trim();
    email = String(email || '').toLowerCase().trim();
    phone = String(phone || '').trim();

    const existing = await User.findByUsername(username);
    if (existing) throw new ApiError(400, 'Username already exists', 'USERNAME_TAKEN');
    const emailExists = await User.findByEmail(email);
    if (emailExists) throw new ApiError(400, 'Email already exists', 'EMAIL_TAKEN');
    const phoneExists = await User.findByPhone(phone);
    if (phoneExists) throw new ApiError(400, 'Phone number already exists', 'PHONE_TAKEN');

    const adminCount = await User.countByRole(['admin', 'general_admin']);
    if (adminCount >= 20) throw new ApiError(400, 'Maximum 20 admins allowed', 'ADMIN_LIMIT');

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      username,
      email,
      phone,
      password_hash: passwordHash,
      role: 'admin',
      service_element: serviceElement,
      department
    });

    await AuditLog.create({
      userId: actor.id,
      action: 'ADMIN_CREATED',
      entity: 'user',
      entityId: user.id,
      details: { username }
    });
    return sanitizeUser(user);
  },

  async toggleActive(id, actor) {
    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

    if (user.id === actor.id) {
      throw new ApiError(400, 'Cannot disable your own account', 'SELF_OPERATION');
    }
    if (user.role === 'general_admin') {
      throw new ApiError(400, 'Cannot disable General Admin', 'PROTECTED_USER');
    }

    const updated = await User.toggleActive(id, !user.active);
    await AuditLog.create({
      userId: actor.id,
      action: updated.active ? 'USER_ACTIVATED' : 'USER_DISABLED',
      entity: 'user',
      entityId: id,
      details: { username: user.username }
    });
    return sanitizeUser(updated);
  },

  async delete(id, actor) {
    const user = await User.findById(id);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

    if (user.id === actor.id) {
      throw new ApiError(400, 'Cannot delete your own account', 'SELF_OPERATION');
    }

    const { pool } = require('../config/db');
    const { rows } = await pool.query('SELECT 1 FROM bookings WHERE user_id = $1 LIMIT 1', [id]);
    if (rows.length) {
      throw new ApiError(400, 'Cannot delete user with existing bookings', 'USER_HAS_BOOKINGS');
    }

    await User.deleteById(id);
    await AuditLog.create({
      userId: actor.id,
      action: 'USER_DELETED',
      entity: 'user',
      entityId: id,
      details: { username: user.username }
    });
    return { id, username: user.username };
  }
};

module.exports = UserService;
