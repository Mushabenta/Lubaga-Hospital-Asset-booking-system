class ApiError extends Error {
  constructor(statusCode, message, error = null) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
