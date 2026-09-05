import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error.js';
import prisma from '../lib/prisma.js';

/**
 * Portal Authentication Middleware (PRD Metric M6 Guard)
 * 
 * 1. Verifies the token using PORTAL_JWT_SECRET (strictly distinct from JWT_SECRET).
 * 2. Enforces that claim 'typ' === 'portal'.
 * 3. Checks the database table 'portal_tokens' to ensure the link has not been revoked or expired.
 * 4. Ensures the customer can ONLY access the quotation linked to their portal token.
 */
export const requirePortal = async (req, res, next) => {
  try {
    // Extract token from 'Authorization: Bearer <token>' header or query string
    let tokenString = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      tokenString = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      tokenString = req.query.token;
    }

    if (!tokenString) {
      throw new ApiError(401, 'Portal token is required to access this resource');
    }

    const portalSecret = process.env.PORTAL_JWT_SECRET;
    if (!portalSecret) {
      throw new ApiError(500, 'PORTAL_JWT_SECRET is not configured on the server');
    }

    // Verify token cryptographically using PORTAL_JWT_SECRET
    // If an internal token (signed with JWT_SECRET) is passed here, verification will fail!
    let decoded;
    try {
      decoded = jwt.verify(tokenString, portalSecret);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        throw new ApiError(401, 'Your portal access link has expired');
      }
      throw new ApiError(401, 'Invalid portal token signature. Internal tokens cannot access customer portal.');
    }

    // Verify token type claim
    if (decoded.typ !== 'portal') {
      throw new ApiError(403, 'Forbidden: Provided token is not a portal token');
    }

    // Check database to verify revocation and database-level expiry
    const portalTokenRecord = await prisma.portalToken.findUnique({
      where: { token: tokenString },
      include: {
        quotation: {
          select: {
            id: true,
            customerId: true,
            status: true,
          }
        }
      }
    });

    if (!portalTokenRecord) {
      throw new ApiError(401, 'Portal token not found or invalid');
    }

    if (portalTokenRecord.isRevoked) {
      throw new ApiError(401, 'This portal access link has been revoked');
    }

    if (new Date(portalTokenRecord.expiresAt) < new Date()) {
      throw new ApiError(401, 'Your portal access link has expired');
    }

    // Update lastUsedAt in the background (fire-and-forget or awaited)
    await prisma.portalToken.update({
      where: { id: portalTokenRecord.id },
      data: { lastUsedAt: new Date() }
    });

    // Attach validated portal session context to the request object
    req.portalSession = {
      tokenId: portalTokenRecord.id,
      token: portalTokenRecord.token,
      quotationId: portalTokenRecord.quotationId,
      customerId: portalTokenRecord.quotation.customerId,
      expiresAt: portalTokenRecord.expiresAt
    };

    next();
  } catch (error) {
    next(error);
  }
};
