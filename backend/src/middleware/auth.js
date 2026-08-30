const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');

// Authenticate a user from the Authorization: Bearer <token> header.
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authorized, no token', 'NO_TOKEN');
  }

  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw new ApiError(401, 'Not authorized, token failed', 'INVALID_TOKEN');
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new ApiError(401, 'User not found', 'USER_NOT_FOUND');
  if (!user.active) throw new ApiError(401, 'Account disabled', 'ACCOUNT_DISABLED');

  req.user = { id: user.id, username: user.username, role: user.role, department: user.department };
  next();
});

// Role gate factory: pass allowed roles.
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) throw new ApiError(401, 'Not authorized', 'NO_TOKEN');
  if (!roles.includes(req.user.role)) {
    throw new ApiError(403, 'Access denied. Insufficient permissions.', 'FORBIDDEN');
  }
  next();
};

// Convenience: adminOnly = admin or general_admin
const adminOnly = authorize('admin', 'general_admin');
const generalAdminOnly = authorize('general_admin');

module.exports = { protect, authorize, adminOnly, generalAdminOnly };
