const ApiError = require('../utils/ApiError');

// Centralised success/error response helpers.
const success = (res, data, message = '', status = 200) => {
  return res.status(status).json({ success: true, message, data });
};

const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
};

// convert unknown errors into a safe API error (no stack/sql leakage)
const errorConverter = (err, req, res, next) => {
  let error = err;
  if (!(error instanceof ApiError)) {
    // Never expose internal error details to the client.
    console.error('Unhandled error:', err);
    const statusCode = 500;
    const message = 'Something went wrong';
    error = new ApiError(statusCode, message, 'INTERNAL_ERROR');
  }
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const { statusCode = 500, message } = err;
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${statusCode}] ${message}`, process.env.NODE_ENV === 'development' ? err : '');
  }
  res.status(statusCode).json({
    success: false,
    message,
    error: err.error || 'ERROR'
  });
};

module.exports = { success, notFound, errorConverter, errorHandler };
