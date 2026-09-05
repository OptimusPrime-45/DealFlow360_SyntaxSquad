import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-internal";

/**
 * Middleware: requireInternal / authenticate
 * Verifies internal JWT, ensures typ === 'internal', checks user active state,
 * and attaches `req.user` with role.
 */
export const requireInternal = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication token missing or malformed");
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Token has expired");
    }
    throw new ApiError(401, "Invalid token");
  }

  // Enforce cryptographic boundary from architecture doc (M6):
  // token must carry typ: 'internal'
  if (decoded.typ !== "internal") {
    throw new ApiError(403, "Access denied: invalid token scope for internal API");
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: {
      role: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }

  if (!user.isActive) {
    throw new ApiError(403, "User account is inactive");
  }

  // Attach user to request
  req.user = user;
  next();
});

export const authenticate = requireInternal;

/**
 * Middleware: requireRole
 * Role-based access control checking against user's Role.code
 * e.g. requireRole('ADMIN', 'SALES_MANAGER')
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      throw new ApiError(401, "Authentication required");
    }

    const userRole = req.user.role.code;
    if (!allowedRoles.includes(userRole)) {
      throw new ApiError(
        403,
        `Forbidden: role '${userRole}' does not have required permissions`
      );
    }

    next();
  };
};

export default {
  requireInternal,
  authenticate,
  requireRole,
};
