import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-internal";
const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || `${JWT_SECRET}_refresh`;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

// Zod schemas for input validation
// Roles a person may give THEMSELVES at signup.
//
// ADMIN is excluded on purpose: self-service signup as ADMIN would let anyone
// who can reach the page grant themselves every discount ceiling, the approval
// ladder and the whole configuration surface. Privileged roles are granted by
// an existing admin, or seeded.
export const SELF_SERVICE_ROLES = ["SALES_REP", "SALES_MANAGER", "FINANCE"];

const registerSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
  fullName: z.string().min(2, "Full name must be at least 2 characters long"),
  roleCode: z
    .enum(["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"])
    .optional()
    .default("SALES_REP"),
});

const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * Helper: Generate Access Token and Refresh Token for User
 */
const generateTokens = (user) => {
  const roleCode = user.role?.code || "SALES_REP";

  const accessToken = jwt.sign(
    {
      typ: "internal",
      userId: user.id,
      role: roleCode,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    {
      typ: "refresh",
      userId: user.id,
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken, refreshToken };
};

/**
 * Helper: Format user object for API output
 */
const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  isActive: user.isActive,
  role: user.role?.code || null,
  roleName: user.role?.name || null,
  createdAt: user.createdAt,
});

/**
 * Register User
 * POST /api/auth/register
 */
export const registerUser = asyncHandler(async (req, res) => {
  const validated = registerSchema.parse(req.body);
  const normalizedEmail = validated.email.toLowerCase().trim();

  // A privileged role may only be granted by someone who already holds it.
  // The route is public, so req.user is set only when a signed-in admin is
  // creating the account on someone else's behalf.
  if (!SELF_SERVICE_ROLES.includes(validated.roleCode)) {
    const grantedByAdmin = req.user?.role?.code === "ADMIN";

    if (!grantedByAdmin) {
      // Exception: the very first account has to be able to bootstrap the
      // system, so an ADMIN is allowed while no users exist at all.
      const userCount = await prisma.user.count();

      if (userCount > 0) {
        throw new ApiError(
          403,
          `The ${validated.roleCode} role cannot be self-assigned. Ask an administrator to create this account.`
        );
      }
    }
  }

  // Check duplicate email
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new ApiError(409, "A user with this email already exists");
  }

  // Lookup role
  const role = await prisma.role.findUnique({
    where: { code: validated.roleCode },
  });

  if (!role) {
    throw new ApiError(400, `Role '${validated.roleCode}' does not exist`);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(validated.password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      fullName: validated.fullName.trim(),
      roleId: role.id,
      isActive: true,
    },
    include: {
      role: true,
    },
  });

  const tokens = generateTokens(user);

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        user: formatUser(user),
        ...tokens,
      },
      "User registered successfully"
    )
  );
});

/**
 * Login User
 * POST /api/auth/login
 */
export const loginUser = asyncHandler(async (req, res) => {
  const validated = loginSchema.parse(req.body);
  const normalizedEmail = validated.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      role: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    throw new ApiError(403, "Account is deactivated");
  }

  const isPasswordValid = await bcrypt.compare(
    validated.password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const tokens = generateTokens(user);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: formatUser(user),
        ...tokens,
      },
      "Login successful"
    )
  );
});

/**
 * Refresh Access Token
 * POST /api/auth/refresh
 */
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const validated = refreshSchema.parse(req.body);

  let decoded;
  try {
    decoded = jwt.verify(validated.refreshToken, REFRESH_TOKEN_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Refresh token expired, please log in again");
    }
    throw new ApiError(401, "Invalid refresh token");
  }

  if (decoded.typ !== "refresh" || !decoded.userId) {
    throw new ApiError(401, "Malformed refresh token");
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: {
      role: true,
    },
  });

  if (!user || !user.isActive) {
    throw new ApiError(401, "User is inactive or no longer exists");
  }

  const tokens = generateTokens(user);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: formatUser(user),
        ...tokens,
      },
      "Token refreshed successfully"
    )
  );
});

/**
 * Get Current User Profile
 * GET /api/auth/me
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      role: true,
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: formatUser(user),
      },
      "Current user profile retrieved"
    )
  );
});

/**
 * Get Available Roles
 * GET /api/auth/roles
 */
export const getRoles = asyncHandler(async (req, res) => {
  const roles = await prisma.role.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      isSystem: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        roles,
      },
      "Roles retrieved successfully"
    )
  );
});

export default {
  registerUser,
  loginUser,
  refreshAccessToken,
  getCurrentUser,
  getRoles,
};
