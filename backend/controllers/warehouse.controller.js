// ============================================================================
//  DealFlow360 — Warehouse & inventory configuration  (§9 steps 1 and 5)
//
//  §9 step 1 requires an admin to CREATE a warehouse as a real user action, and
//  step 5 needs stock levels the allocation engine can split across.
// ============================================================================

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const warehouseSchema = z.object({
  code: z.string().min(1, "Warehouse code is required"),
  name: z.string().min(1, "Warehouse name is required"),
  address: z.string().optional().nullable(),
  // Relative cost of shipping from here. The split minimises the number of
  // warehouses first, then breaks ties on this (PDF §4-A4).
  shippingWeight: z.number().min(0).default(1),
  priority: z.number().int().default(0),
  isActive: z.boolean().optional().default(true),
});

const inventorySchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  availableQty: z.number().int().min(0).default(0),
  reservedQty: z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).default(0),
});

/** GET /api/warehouses */
export const getWarehouses = asyncHandler(async (req, res) => {
  const warehouses = await prisma.warehouse.findMany({
    include: {
      inventory: {
        include: { product: { select: { id: true, sku: true, name: true } } },
      },
      _count: { select: { inventory: true } },
    },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { warehouses }, "Warehouses retrieved"));
});

/** GET /api/warehouses/:id */
export const getWarehouseById = asyncHandler(async (req, res) => {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: req.params.id },
    include: {
      inventory: { include: { product: true } },
    },
  });

  if (!warehouse) throw new ApiError(404, "Warehouse not found");

  return res
    .status(200)
    .json(new ApiResponse(200, { warehouse }, "Warehouse retrieved"));
});

/** POST /api/warehouses */
export const createWarehouse = asyncHandler(async (req, res) => {
  const input = warehouseSchema.parse(req.body);

  const warehouse = await prisma.warehouse.create({ data: input });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Warehouse",
    entityId: warehouse.id,
    action: "WAREHOUSE_CREATED",
    newValue: input,
    reason: "Warehouse created via backend configuration",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { warehouse }, "Warehouse created"));
});

/** PATCH /api/warehouses/:id */
export const updateWarehouse = asyncHandler(async (req, res) => {
  const input = warehouseSchema.partial().parse(req.body);

  const existing = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "Warehouse not found");

  const warehouse = await prisma.warehouse.update({
    where: { id: req.params.id },
    data: input,
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Warehouse",
    entityId: warehouse.id,
    action: "WAREHOUSE_UPDATED",
    oldValue: { code: existing.code, shippingWeight: existing.shippingWeight },
    newValue: input,
    reason: "Warehouse updated",
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { warehouse }, "Warehouse updated"));
});

/** DELETE /api/warehouses/:id */
export const deleteWarehouse = asyncHandler(async (req, res) => {
  const allocations = await prisma.fulfillmentAllocation.count({
    where: { warehouseId: req.params.id },
  });

  if (allocations > 0) {
    throw new ApiError(
      409,
      "Warehouse has fulfillment allocations and cannot be deleted; deactivate it instead"
    );
  }

  await prisma.warehouse.delete({ where: { id: req.params.id } });

  return res.status(200).json(new ApiResponse(200, {}, "Warehouse deleted"));
});

/**
 * PUT /api/warehouses/:id/inventory
 * Set the stock level for one product in this warehouse (upsert).
 */
export const setInventory = asyncHandler(async (req, res) => {
  const { id: warehouseId } = req.params;
  const input = inventorySchema.parse(req.body);

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse) throw new ApiError(404, "Warehouse not found");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new ApiError(400, `Product not found: ${input.productId}`);

  const inventory = await prisma.inventory.upsert({
    where: {
      warehouseId_productId: { warehouseId, productId: input.productId },
    },
    update: {
      availableQty: input.availableQty,
      ...(input.reservedQty !== undefined && { reservedQty: input.reservedQty }),
      reorderLevel: input.reorderLevel,
    },
    create: {
      warehouseId,
      productId: input.productId,
      availableQty: input.availableQty,
      reservedQty: input.reservedQty ?? 0,
      reorderLevel: input.reorderLevel,
    },
    include: { product: { select: { sku: true, name: true } } },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Inventory",
    entityId: inventory.id,
    action: "STOCK_LEVEL_SET",
    newValue: { warehouse: warehouse.code, sku: product.sku, availableQty: input.availableQty },
    reason: "Stock level set via backend configuration",
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { inventory }, "Stock level updated"));
});

/**
 * GET /api/warehouses/stock/overview
 * Stock for every product across every warehouse — what the fulfillment screen
 * needs to explain why a split was recommended.
 */
export const getStockOverview = asyncHandler(async (req, res) => {
  const inventory = await prisma.inventory.findMany({
    include: {
      product: { select: { id: true, sku: true, name: true } },
      warehouse: { select: { id: true, code: true, name: true, shippingWeight: true } },
    },
    orderBy: [{ product: { sku: "asc" } }, { warehouse: { code: "asc" } }],
  });

  const byProduct = {};
  for (const row of inventory) {
    const key = row.product.sku;
    if (!byProduct[key]) {
      byProduct[key] = {
        productId: row.product.id,
        sku: row.product.sku,
        name: row.product.name,
        totalAvailable: 0,
        warehouses: [],
      };
    }
    const sellable = row.availableQty - row.reservedQty;
    byProduct[key].totalAvailable += sellable;
    byProduct[key].warehouses.push({
      warehouseId: row.warehouse.id,
      code: row.warehouse.code,
      name: row.warehouse.name,
      shippingWeight: row.warehouse.shippingWeight,
      availableQty: row.availableQty,
      reservedQty: row.reservedQty,
      sellableQty: sellable,
    });
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { stock: Object.values(byProduct) }, "Stock overview retrieved")
    );
});

export default {
  getWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  setInventory,
  getStockOverview,
};
