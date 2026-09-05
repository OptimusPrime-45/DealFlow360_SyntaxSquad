// ============================================================================
//  DealFlow360 — Services Controller
//  Dedicated domain controller for professional and recurring service offerings.
//  Manages Service SKU, labor rates, delivery units (hour, day, project, month),
//  costs, and service categorization.
// ============================================================================

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const serviceSchema = z.object({
  name: z.string().min(2, "Service name is required"),
  sku: z.string().min(2, "Service SKU is required"),
  description: z.string().optional().nullable(),
  categoryId: z.string().min(1, "Category ID is required"),
  basePrice: z.number().min(0, "Service rate/price cannot be negative"),
  costPrice: z.number().min(0, "Service cost/labor cannot be negative"),
  unit: z.string().default("hour"),
  taxRate: z.number().min(0).default(18),
  isPromoted: z.boolean().default(false),
});

const updateServiceSchema = serviceSchema.partial();

/**
 * GET /api/services
 * Retrieves all services from the catalogue.
 */
export const getServices = asyncHandler(async (req, res) => {
  const { search, categoryId, unit } = req.query;

  const where = {
    productType: "SERVICE",
    isActive: true,
    ...(categoryId && { categoryId: String(categoryId) }),
    ...(unit && { unit: String(unit) }),
    ...(search && {
      OR: [
        { name: { contains: String(search), mode: "insensitive" } },
        { sku: { contains: String(search), mode: "insensitive" } },
      ],
    }),
  };

  const services = await prisma.product.findMany({
    where,
    include: {
      category: true,
      _count: {
        select: {
          quotationLines: true,
          orderLines: true,
          coPurchaseSources: true,
          coPurchaseTargets: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { services }, "Services retrieved successfully"));
});

/**
 * GET /api/services/:id
 */
export const getServiceById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const service = await prisma.product.findFirst({
    where: { id, productType: "SERVICE" },
    include: {
      category: true,
      _count: {
        select: { quotationLines: true, orderLines: true },
      },
    },
  });

  if (!service) {
    throw new ApiError(404, "Service offering not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { service }, "Service retrieved successfully"));
});

/**
 * POST /api/services
 * Creates a new service offering.
 */
export const createService = asyncHandler(async (req, res) => {
  const input = serviceSchema.parse(req.body);

  const existingSku = await prisma.product.findUnique({
    where: { sku: input.sku.toUpperCase().trim() },
  });
  if (existingSku) {
    throw new ApiError(409, `Service with SKU '${input.sku}' already exists`);
  }

  const category = await prisma.productCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) {
    throw new ApiError(400, "Selected category does not exist");
  }

  const service = await prisma.product.create({
    data: {
      sku: input.sku.toUpperCase().trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      categoryId: category.id,
      productType: "SERVICE",
      basePrice: input.basePrice,
      costPrice: input.costPrice,
      unit: input.unit || "hour",
      taxRate: input.taxRate ?? 18,
      isPromoted: !!input.isPromoted,
      isActive: true,
    },
    include: { category: true },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Product",
    entityId: service.id,
    action: "SERVICE_CREATED",
    newValue: { sku: service.sku, name: service.name, unit: service.unit },
    reason: "Created new Service catalogue offering",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { service }, "Service created successfully"));
});

/**
 * PATCH /api/services/:id
 */
export const updateService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const input = updateServiceSchema.parse(req.body);

  const existing = await prisma.product.findFirst({
    where: { id, productType: "SERVICE" },
  });
  if (!existing) {
    throw new ApiError(404, "Service not found");
  }

  if (input.sku && input.sku.toUpperCase().trim() !== existing.sku) {
    const dup = await prisma.product.findUnique({
      where: { sku: input.sku.toUpperCase().trim() },
    });
    if (dup) throw new ApiError(409, `SKU '${input.sku}' is already in use`);
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name.trim() }),
      ...(input.sku && { sku: input.sku.toUpperCase().trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.categoryId && { categoryId: input.categoryId }),
      ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
      ...(input.costPrice !== undefined && { costPrice: input.costPrice }),
      ...(input.unit && { unit: input.unit }),
      ...(input.taxRate !== undefined && { taxRate: input.taxRate }),
      ...(input.isPromoted !== undefined && { isPromoted: input.isPromoted }),
    },
    include: { category: true },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { service: updated }, "Service updated successfully"));
});

/**
 * DELETE /api/services/:id
 */
export const deleteService = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.product.findFirst({
    where: { id, productType: "SERVICE" },
    include: {
      _count: { select: { quotationLines: true, orderLines: true } },
    },
  });
  if (!existing) {
    throw new ApiError(404, "Service not found");
  }

  if (existing._count.quotationLines > 0 || existing._count.orderLines > 0) {
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  } else {
    await prisma.product.delete({ where: { id } });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { id }, "Service removed from catalogue"));
});
