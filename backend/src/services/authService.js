const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { pool } = require('../config/db');

const hashPassword = (password) => bcrypt.hash(password, 10);

const generateToken = (user) => {
  return jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiry
  });
};

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  phone: user.phone,
  role: user.role,
  service_element: user.service_element,
  department: user.department,
  active: user.active
});

const AuthService = {
  async register({ username, email, phone, password, serviceElement, department }) {
    email = email.toLowerCase().trim();
    username = username.trim();

    const existing = await User.findByUsername(username);
    if (existing) throw new ApiError(400, 'Username already taken', 'USERNAME_TAKEN');

    const emailExists = await User.findByEmail(email);
    if (emailExists) throw new ApiError(400, 'Email already registered', 'EMAIL_TAKEN');

    const phoneExists = await User.findByPhone(phone);
    if (phoneExists) throw new ApiError(400, 'Phone number already registered', 'PHONE_TAKEN');

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const isFirstUser = rows[0].count === 0;

    // Security: role is never accepted from the client. First user becomes
    // general_admin (bootstrapping); everyone else is staff.
    const role = isFirstUser ? 'general_admin' : 'staff';

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      username,
      email,
      phone,
      password_hash: passwordHash,
      role,
      service_element: serviceElement,
      department
    });

    await AuditLog.create({
      userId: user.id,
      action: 'USER_REGISTERED',
      entity: 'user',
      entityId: user.id
    });

    return { token: generateToken(user), user: sanitizeUser(user) };
  },

  async login(identifier, password) {
    const user = await User.findByLogin(identifier);
    if (!user) throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

    if (!user.active) {
      throw new ApiError(401, 'Account disabled. Contact admin.', 'ACCOUNT_DISABLED');
    }

    await AuditLog.create({ userId: user.id, action: 'USER_LOGIN', entity: 'user', entityId: user.id });

    return { token: generateToken(user), user: sanitizeUser(user) };
  },

  async resetPasswordByPhone(phone, newPassword) {
    const user = await User.findByPhone(phone);
    if (!user) throw new ApiError(404, 'No user found with this phone number', 'USER_NOT_FOUND');

    const passwordHash = await hashPassword(newPassword);
    await User.updatePassword(user.id, passwordHash);

    await AuditLog.create({
      userId: user.id,
      action: 'PASSWORD_RESET',
      entity: 'user',
      entityId: user.id
    });

    return sanitizeUser(user);
  },

  async me(userId) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    return sanitizeUser(user);
  },

  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findByIdWithPassword(userId);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) throw new ApiError(400, 'Current password is incorrect', 'INVALID_PASSWORD');

    const passwordHash = await hashPassword(newPassword);
    await User.updatePassword(userId, passwordHash);

    await AuditLog.create({ userId, action: 'PASSWORD_CHANGED', entity: 'user', entityId: userId });
    return sanitizeUser(user);
  }
};

module.exports = AuthService;
