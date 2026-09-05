import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

// Validation Schemas
const customerSchema = z.object({
  name: z.string().min(2, "Customer name must be at least 2 characters"),
  contactEmail: z.string().email("Valid contact email required"),
  phone: z.string().optional(),
  billingAddress: z.string().optional(),
  customerTierId: z.string().min(1, "Customer tier is required"),
  ownerRepId: z.string().optional(),
});

const updateCustomerSchema = customerSchema.partial();

const updateTierSchema = z.object({
  maxDiscountPercent: z
    .number()
    .min(0, "Ceiling cannot be negative")
    .max(100, "Ceiling cannot exceed 100%"),
});

/**
 * Get all customers
 * GET /api/customers
 */
export const getCustomers = asyncHandler(async (req, res) => {
  const { search, tierId } = req.query;

  const where = {
    isActive: true,
    ...(tierId && { customerTierId: String(tierId) }),
    ...(search && {
      OR: [
        { name: { contains: String(search), mode: "insensitive" } },
        { contactEmail: { contains: String(search), mode: "insensitive" } },
      ],
    }),
  };

  const customers = await prisma.customer.findMany({
    where,
    include: {
      customerTier: true,
      ownerRep: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { customers }, "Customers retrieved successfully"));
});

/**
 * Get single customer by ID
 * GET /api/customers/:id
 */
export const getCustomerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      customerTier: true,
      ownerRep: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { customer }, "Customer retrieved"));
});

/**
 * Create new customer
 * POST /api/customers
 */
export const createCustomer = asyncHandler(async (req, res) => {
  const validated = customerSchema.parse(req.body);

  // Check unique contact email
  const existing = await prisma.customer.findUnique({
    where: { contactEmail: validated.contactEmail.toLowerCase().trim() },
  });

  if (existing) {
    throw new ApiError(409, "A customer with this email already exists");
  }

  // Ensure customer tier exists
  const tier = await prisma.customerTier.findUnique({
    where: { id: validated.customerTierId },
  });

  if (!tier) {
    throw new ApiError(400, "Selected customer tier does not exist");
  }

  const customer = await prisma.customer.create({
    data: {
      name: validated.name.trim(),
      contactEmail: validated.contactEmail.toLowerCase().trim(),
      phone: validated.phone?.trim() || null,
      billingAddress: validated.billingAddress?.trim() || null,
      customerTierId: tier.id,
      ownerRepId: validated.ownerRepId || req.user?.id || null,
    },
    include: {
      customerTier: true,
      ownerRep: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { customer }, "Customer created successfully"));
});

/**
 * Update customer
 * PATCH /api/customers/:id
 */
export const updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const validated = updateCustomerSchema.parse(req.body);

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(validated.name && { name: validated.name.trim() }),
      ...(validated.contactEmail && {
        contactEmail: validated.contactEmail.toLowerCase().trim(),
      }),
      ...(validated.phone !== undefined && { phone: validated.phone }),
      ...(validated.billingAddress !== undefined && {
        billingAddress: validated.billingAddress,
      }),
      ...(validated.customerTierId && { customerTierId: validated.customerTierId }),
      ...(validated.ownerRepId !== undefined && {
        ownerRepId: validated.ownerRepId,
      }),
    },
    include: {
      customerTier: true,
      ownerRep: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { customer }, "Customer updated successfully"));
});

/**
 * Delete / deactivate customer
 * DELETE /api/customers/:id
 */
export const deleteCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await prisma.customer.update({
    where: { id },
    data: { isActive: false },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Customer deactivated successfully"));
});

/**
 * Get all Customer Tiers
 * GET /api/customer-tiers
 */
export const getCustomerTiers = asyncHandler(async (req, res) => {
  const tiers = await prisma.customerTier.findMany({
    orderBy: { rank: "asc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { tiers }, "Customer tiers retrieved"));
});

/**
 * Update Tier Ceiling (Admin live configuration)
 * PATCH /api/customer-tiers/:id
 */
export const updateCustomerTier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { maxDiscountPercent } = updateTierSchema.parse(req.body);

  const tier = await prisma.customerTier.update({
    where: { id },
    data: { maxDiscountPercent },
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { tier }, `Tier ${tier.name} ceiling updated to ${tier.maxDiscountPercent}%`)
    );
});

export default {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerTiers,
  updateCustomerTier,
};
