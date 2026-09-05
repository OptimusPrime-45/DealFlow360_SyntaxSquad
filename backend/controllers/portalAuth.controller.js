// ============================================================================
//  DealFlow360 — Customer portal authentication  (PDF §4-A1)
//
//  "Customers access their quotations through a portal login (magic link, or
//   email and password)."
//
//  The magic-link half already existed. This adds the credential half, so a
//  customer can reach the portal without waiting for a rep to mint a link.
//
//  A credential session is scoped to the CUSTOMER, not to one quotation, so it
//  can list every quotation that customer owns — and nothing else.
// ============================================================================

import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const setPasswordSchema = z.object({
  password: z.string().min(8, "Portal password must be at least 8 characters long"),
});

const PORTAL_SESSION_HOURS = 12;

/**
 * POST /api/portal/login
 * Customer signs in with the email on their account plus a portal password.
 *
 * Signed with PORTAL_JWT_SECRET, so the resulting token is cryptographically
 * useless against any internal /api/* route.
 */
export const portalLogin = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const normalizedEmail = email.toLowerCase().trim();

  const customer = await prisma.customer.findUnique({
    where: { contactEmail: normalizedEmail },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      isActive: true,
      portalPasswordHash: true,
    },
  });

  // One message for every failure mode — a wrong address, an account with no
  // portal password, and a wrong password must be indistinguishable, or this
  // endpoint becomes a way to enumerate customers.
  const invalid = () => new ApiError(401, "Invalid email or password");

  if (!customer || !customer.portalPasswordHash) {
    throw invalid();
  }

  const matches = await bcrypt.compare(password, customer.portalPasswordHash);
  if (!matches) {
    throw invalid();
  }

  if (!customer.isActive) {
    throw new ApiError(403, "This account is inactive. Please contact your account manager.");
  }

  const portalSecret = process.env.PORTAL_JWT_SECRET;
  if (!portalSecret) {
    throw new ApiError(500, "PORTAL_JWT_SECRET is not configured on the server");
  }

  const token = jwt.sign(
    { typ: "portal", scope: "customer", customerId: customer.id },
    portalSecret,
    { expiresIn: `${PORTAL_SESSION_HOURS}h` }
  );

  await prisma.customer.update({
    where: { id: customer.id },
    data: { portalLastLoginAt: new Date() },
  });

  await recordAuditLog({
    userId: null,
    actorType: "CUSTOMER",
    entityType: "Customer",
    entityId: customer.id,
    action: "PORTAL_LOGIN",
    newValue: { email: customer.contactEmail },
    reason: "Customer signed in to the portal with credentials",
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        token,
        expiresInHours: PORTAL_SESSION_HOURS,
        customer: { id: customer.id, name: customer.name, email: customer.contactEmail },
      },
      `Welcome back, ${customer.name}`
    )
  );
});

/**
 * GET /api/portal/me
 * Who the current portal session belongs to, and how it was established.
 */
export const portalMe = asyncHandler(async (req, res) => {
  const { customerId, scope, quotationId, expiresAt } = req.portalSession;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, contactEmail: true },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { customer, scope, quotationId, expiresAt }, "Portal session"));
});

/**
 * GET /api/portal/quotations
 * Every quotation belonging to the signed-in customer.
 *
 * Credential sessions only: a magic link is deliberately scoped to the single
 * quotation it was minted for, and must not become a door to the rest.
 */
export const listPortalQuotations = asyncHandler(async (req, res) => {
  const { customerId, scope } = req.portalSession;

  if (scope !== "customer") {
    throw new ApiError(
      403,
      "This link gives access to one quotation only. Sign in with your email to see all of them."
    );
  }

  const quotations = await prisma.quotation.findMany({
    where: {
      customerId,
      // Drafts are the rep's private working state and are not shown.
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      grandTotal: true,
      validUntil: true,
      sentToCustomerAt: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { quotations }, `${quotations.length} quotation(s)`));
});

/**
 * POST /api/customers/:id/portal-password   (internal, staff only)
 * Set or reset a customer's portal password so they can sign in themselves.
 */
export const setCustomerPortalPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = setPasswordSchema.parse(req.body);

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, contactEmail: true },
  });

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const portalPasswordHash = await bcrypt.hash(password, 10);

  await prisma.customer.update({
    where: { id },
    data: { portalPasswordHash },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Customer",
    entityId: id,
    action: "PORTAL_PASSWORD_SET",
    // Never log the password itself, only that it changed.
    newValue: { email: customer.contactEmail },
    reason: "Portal password set by staff",
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { customerId: id, email: customer.contactEmail },
        `${customer.name} can now sign in to the portal with ${customer.contactEmail}`
      )
    );
});

export default {
  portalLogin,
  portalMe,
  listPortalQuotations,
  setCustomerPortalPassword,
};
