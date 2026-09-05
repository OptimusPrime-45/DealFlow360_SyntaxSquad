import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error.js';
import prisma from '../lib/prisma.js';

/**
 * Portal Authentication Middleware (PRD Metric M6 Guard)
 *
 * Verifies the token with PORTAL_JWT_SECRET — strictly distinct from JWT_SECRET,
 * so an internal staff token fails signature verification here and a portal
 * token fails it on every internal route. The boundary is cryptographic, not a
 * role check that someone could forget to apply.
 *
 * PDF §4-A1 allows customers in two ways, and both land here:
 *
 *   LINK sessions     — a magic link a rep minted. The token is backed by a
 *                       PortalToken row and is scoped to ONE quotation. The
 *                       quotation is taken from that row and can never be
 *                       overridden by a query parameter.
 *
 *   CUSTOMER sessions — email + password. Scoped to the customer, so it may
 *                       reach any of THEIR quotations but no one else's. The
 *                       target quotation comes from ?quotationId= and is
 *                       verified to belong to that customer before it is
 *                       attached to the session.
 */
export const requirePortal = async (req, res, next) => {
  try {
    // Extract the token from the Authorization header or the query string.
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

    // If an internal token (signed with JWT_SECRET) is passed here it fails.
    let decoded;
    try {
      decoded = jwt.verify(tokenString, portalSecret);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        throw new ApiError(401, 'Your portal access link has expired');
      }
      throw new ApiError(
        401,
        'Invalid portal token signature. Internal tokens cannot access customer portal.'
      );
    }

    if (decoded.typ !== 'portal') {
      throw new ApiError(403, 'Forbidden: Provided token is not a portal token');
    }

    // ── Credential session ───────────────────────────────────────────────────
    if (decoded.scope === 'customer') {
      const customer = await prisma.customer.findUnique({
        where: { id: decoded.customerId },
        select: { id: true, name: true, contactEmail: true, isActive: true },
      });

      if (!customer) {
        throw new ApiError(401, 'Customer account no longer exists');
      }
      if (!customer.isActive) {
        throw new ApiError(403, 'This customer account is inactive');
      }

      // A customer session may name a quotation, but only one of their own.
      const requestedQuotationId =
        req.query?.quotationId || req.body?.quotationId || null;

      let quotationId = null;
      if (requestedQuotationId) {
        const quotation = await prisma.quotation.findUnique({
          where: { id: String(requestedQuotationId) },
          select: { id: true, customerId: true },
        });

        // Report a mismatch as "not found" rather than "forbidden" so the
        // response cannot be used to probe which quotation ids exist.
        if (!quotation || quotation.customerId !== customer.id) {
          throw new ApiError(404, 'Quotation not found for this account');
        }

        quotationId = quotation.id;
      }

      req.portalSession = {
        scope: 'customer',
        tokenId: null,
        token: tokenString,
        customerId: customer.id,
        customerName: customer.name,
        quotationId,
        expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null,
      };

      return next();
    }

    // ── Magic-link session ───────────────────────────────────────────────────
    const portalTokenRecord = await prisma.portalToken.findUnique({
      where: { token: tokenString },
      include: {
        quotation: {
          select: { id: true, customerId: true, status: true },
        },
      },
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

    await prisma.portalToken.update({
      where: { id: portalTokenRecord.id },
      data: { lastUsedAt: new Date() },
    });

    // The quotation comes from the token record, never from the request, so a
    // link cannot be pointed at a different quotation by adding a parameter.
    req.portalSession = {
      scope: 'link',
      tokenId: portalTokenRecord.id,
      token: portalTokenRecord.token,
      quotationId: portalTokenRecord.quotationId,
      customerId: portalTokenRecord.quotation.customerId,
      expiresAt: portalTokenRecord.expiresAt,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export default { requirePortal };
