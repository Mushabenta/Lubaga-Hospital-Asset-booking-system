const { Category, Department } = require('../models/Reference');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success } = require('../middleware/error');

const ReferenceController = {
  listCategories: asyncHandler(async (req, res) => {
    success(res, { categories: await Category.findAll() });
  }),

  createCategory: asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new ApiError(400, 'Category name is required', 'NAME_REQUIRED');
    const category = await Category.create(name);
    if (!category) throw new ApiError(400, 'Category already exists', 'NAME_TAKEN');
    await AuditLog.create({ userId: req.user.id, action: 'CATEGORY_CREATED', entity: 'category', entityId: category.id });
    success(res, { category }, 'Category created', 201);
  }),

  deleteCategory: asyncHandler(async (req, res) => {
    const deleted = await Category.deleteById(req.params.id);
    if (!deleted) throw new ApiError(404, 'Category not found', 'NOT_FOUND');
    await AuditLog.create({ userId: req.user.id, action: 'CATEGORY_DELETED', entity: 'category', entityId: req.params.id });
    success(res, {}, 'Category deleted');
  }),

  listDepartments: asyncHandler(async (req, res) => {
    success(res, { departments: await Department.findAll() });
  })
};

module.exports = ReferenceController;
