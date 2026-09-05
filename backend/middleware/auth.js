import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error.js';

/**
 * Internal Authentication Middleware
 * 
 * 1. Verifies token using JWT_SECRET (distinct from PORTAL_JWT_SECRET).
 * 2. Enforces that claim 'typ' === 'internal'.
 * 3. Prevents any portal token from accessing internal backend routes (Metric M6).
 */
export const requireInternal = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Internal authorization token required');
    }

    const tokenString = authHeader.split(' ')[1];
    const internalSecret = process.env.JWT_SECRET;
    if (!internalSecret) {
      throw new ApiError(500, 'JWT_SECRET is not configured on the server');
    }

    let decoded;
    try {
      decoded = jwt.verify(tokenString, internalSecret);
    } catch (jwtErr) {
      // If a portal token was sent here, signature verification will fail!
      throw new ApiError(401, 'Invalid internal token signature. Portal tokens cannot access internal routes.');
    }

    // Ensure the token has internal type
    if (decoded.typ !== 'internal') {
      throw new ApiError(403, 'Forbidden: Only internal staff tokens may access this endpoint');
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email
    };

    next();
  } catch (error) {
    next(error);
  }
};
