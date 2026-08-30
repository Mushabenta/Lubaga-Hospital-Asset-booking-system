const UserService = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../middleware/error');

const UserController = {
  list: asyncHandler(async (req, res) => {
    const users = await UserService.list();
    success(res, { users });
  }),

  createAdmin: asyncHandler(async (req, res) => {
    const user = await UserService.createAdmin(req.body, req.user);
    success(res, { user }, 'Admin account created', 201);
  }),

  toggleActive: asyncHandler(async (req, res) => {
    const user = await UserService.toggleActive(req.params.id, req.user);
    success(res, { user }, user.active ? 'User activated' : 'User disabled');
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await UserService.delete(req.params.id, req.user);
    success(res, result, 'User deleted');
  })
};

module.exports = UserController;
