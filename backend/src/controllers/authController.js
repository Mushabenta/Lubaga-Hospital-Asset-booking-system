const AuthService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../middleware/error');

const AuthController = {
  register: asyncHandler(async (req, res) => {
    const data = await AuthService.register(req.body);
    success(res, data, 'Registered successfully', 201);
  }),

  login: asyncHandler(async (req, res) => {
    const data = await AuthService.login(req.body.username, req.body.password);
    success(res, data, 'Login successful');
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const user = await AuthService.resetPasswordByPhone(req.body.phone, req.body.newPassword);
    success(res, { user }, 'Password reset successfully');
  }),

  me: asyncHandler(async (req, res) => {
    const user = await AuthService.me(req.user.id);
    success(res, { user });
  }),

  changePassword: asyncHandler(async (req, res) => {
    const user = await AuthService.changePassword(
      req.user.id,
      req.body.currentPassword,
      req.body.newPassword
    );
    success(res, { user }, 'Password changed successfully');
  })
};

module.exports = AuthController;
