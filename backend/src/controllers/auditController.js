const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../middleware/error');

const AuditController = {
  list: asyncHandler(async (req, res) => {
    const data = await AuditLog.findAll({ page: req.query.page, limit: req.query.limit });
    success(res, data);
  })
};

module.exports = AuditController;
