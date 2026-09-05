import { ApiError } from '../utils/api-error.js';

/**
 * Global Error Handler Middleware
 * Formats all errors into a standardized JSON response:
 * {
 *   success: false,
 *   error: {
 *     message: "Error description",
 *     code: "ERROR_CODE",
 *     errors: [] // optional validation details
 *   }
 * }
 */
export const errorHandler = (err, req, res, next) => {
  // If the error is an instance of our custom ApiError, use its properties
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code || 'API_ERROR',
        errors: err.errors || []
      }
    });
  }

  // Handle JSON Web Token errors specifically for clear client feedback
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token: signature verification failed',
        code: 'TOKEN_INVALID'
      }
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      }
    });
  }

  // Fallback for unexpected system errors
  console.error('Unhandled server error:', err);
  return res.status(500).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR'
    }
  });
};
