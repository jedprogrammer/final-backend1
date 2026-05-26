// src/middleware/errorHandler.js
import logger from '../config/logger.js';

export const errorHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;

  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });

  return res.status(status).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production' && status === 500
        ? 'Internal server error'
        : err.message,
  });
};

// Wrap async route handlers so unhandled rejections reach errorHandler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
