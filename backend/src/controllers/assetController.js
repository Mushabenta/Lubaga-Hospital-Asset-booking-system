const AssetService = require('../services/assetService');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../middleware/error');

const AssetController = {
  list: asyncHandler(async (req, res) => {
    const data = await AssetService.list({
      search: req.query.search,
      status: req.query.status,
      categoryId: req.query.categoryId,
      department: req.query.department,
      page: req.query.page,
      limit: req.query.limit
    });
    success(res, data);
  }),

  get: asyncHandler(async (req, res) => {
    const asset = await AssetService.get(req.params.id, req.user);
    success(res, { asset });
  }),

  create: asyncHandler(async (req, res) => {
    const asset = await AssetService.create(req.body, req.user);
    success(res, { asset }, 'Asset created successfully', 201);
  }),

  update: asyncHandler(async (req, res) => {
    const asset = await AssetService.update(req.params.id, req.body, req.user);
    success(res, { asset }, 'Asset updated successfully');
  }),

  setStatus: asyncHandler(async (req, res) => {
    const asset = await AssetService.setStatus(req.params.id, req.body.status, req.user);
    success(res, { asset }, 'Asset status updated');
  }),

  addSpecification: asyncHandler(async (req, res) => {
    const asset = await AssetService.addSpecification(req.params.id, req.body.spec, req.user);
    success(res, { asset }, 'Specification added successfully');
  }),

  removeSpecification: asyncHandler(async (req, res) => {
    const asset = await AssetService.removeSpecification(req.params.id, req.body.spec, req.user);
    success(res, { asset }, 'Specification removed successfully');
  }),

  remove: asyncHandler(async (req, res) => {
    const asset = await AssetService.remove(req.params.id, req.user);
    success(res, { asset }, 'Asset removed successfully');
  })
};

module.exports = AssetController;
