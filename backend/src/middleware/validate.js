const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Runs after express-validator chains; returns 422 with the first error.
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    throw new ApiError(422, first.msg, 'VALIDATION_ERROR');
  }
  next();
};

module.exports = { handleValidation };
