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
  isActive: z.boolean().optional().default(true),
  // Pairwise weights to existing warehouses: { [toWarehouseId]: weight }
  pairWeights: z.record(z.string(), z.number().min(0)).optional().default({}),
});

const batchInventorySchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1, "Product ID is required"),
      availableQty: z.number().int().min(0, "Available quantity must be non-negative"),
      reservedQty: z.number().int().min(0).optional(),
      reorderLevel: z.number().int().min(0).default(0),
    })
  ).min(1, "At least one inventory item is required"),
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
      routesFrom: {
        include: {
          toWarehouse: { select: { id: true, code: true, name: true } },
        },
      },
      _count: { select: { inventory: true, routesFrom: true } },
    },
    orderBy: [{ name: "asc" }],
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
      routesFrom: {
        include: {
          toWarehouse: { select: { id: true, code: true, name: true } },
        },
      },
      routesTo: {
        include: {
          fromWarehouse: { select: { id: true, code: true, name: true } },
        },
      },
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
  const { pairWeights, ...warehouseData } = input;

  const result = await prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.create({ data: warehouseData });

    // Fetch all other existing active warehouses to form pairwise relations
    const existingWarehouses = await tx.warehouse.findMany({
      where: { id: { not: warehouse.id } },
      select: { id: true, code: true, name: true, shippingWeight: true },
    });

    const routeRecords = [];
    for (const other of existingWarehouses) {
      // Look up weight provided by admin, or fallback to default
      const weight =
        pairWeights[other.id] !== undefined
          ? Number(pairWeights[other.id])
          : Number(other.shippingWeight || 1.0);

      // Create bidirectional relation pairs: (new -> other) and (other -> new)
      routeRecords.push(
        { fromWarehouseId: warehouse.id, toWarehouseId: other.id, weight },
        { fromWarehouseId: other.id, toWarehouseId: warehouse.id, weight }
      );
    }

    if (routeRecords.length > 0) {
      await tx.warehouseShippingWeight.createMany({
        data: routeRecords,
        skipDuplicates: true,
      });
    }

    const fullWarehouse = await tx.warehouse.findUnique({
      where: { id: warehouse.id },
      include: {
        routesFrom: {
          include: { toWarehouse: { select: { id: true, code: true, name: true } } },
        },
        _count: { select: { routesFrom: true } },
      },
    });

    return { warehouse: fullWarehouse, routeCount: routeRecords.length };
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Warehouse",
    entityId: result.warehouse.id,
    action: "WAREHOUSE_CREATED",
    newValue: {
      ...warehouseData,
      configuredRoutesCount: result.routeCount,
    },
    reason: "Warehouse created with pairwise shipping weights via admin onboarding",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { warehouse: result.warehouse }, "Warehouse created with pairwise relations"));
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
 * GET /api/warehouses/:id/inventory
 * Retrieves stock levels for all products in a warehouse.
 */
export const getWarehouseInventory = asyncHandler(async (req, res) => {
  const { id: warehouseId } = req.params;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, code: true, name: true, address: true, shippingWeight: true, isActive: true },
  });
  if (!warehouse) throw new ApiError(404, "Warehouse not found");

  const [allProducts, existingInventory] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sku: true,
        name: true,
        basePrice: true,
        costPrice: true,
        category: { select: { name: true } },
      },
      orderBy: [{ sku: "asc" }],
    }),
    prisma.inventory.findMany({
      where: { warehouseId },
    }),
  ]);

  const invMap = new Map(existingInventory.map((i) => [i.productId, i]));

  const inventory = allProducts.map((p) => {
    const inv = invMap.get(p.id);
    const availableQty = inv ? inv.availableQty : 0;
    const reservedQty = inv ? inv.reservedQty : 0;
    const sellableQty = Math.max(0, availableQty - reservedQty);
    const reorderLevel = inv ? inv.reorderLevel : 0;

    return {
      inventoryId: inv?.id || null,
      warehouseId,
      productId: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category?.name || p.category?.code || "Standard",
      basePrice: Number(p.basePrice || 0),
      costPrice: Number(p.costPrice || 0),
      availableQty,
      reservedQty,
      sellableQty,
      reorderLevel,
      isStocked: !!inv,
    };
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { warehouse, inventory },
      `Inventory for warehouse ${warehouse.code} retrieved`
    )
  );
});

/**
 * PUT /api/warehouses/:id/inventory/batch
 * Set stock levels for multiple products in this warehouse in a single transaction.
 */
export const batchSetInventory = asyncHandler(async (req, res) => {
  const { id: warehouseId } = req.params;
  const input = batchInventorySchema.parse(req.body);

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse) throw new ApiError(404, "Warehouse not found");

  const results = await prisma.$transaction(async (tx) => {
    const updatedRows = [];
    for (const item of input.items) {
      const inv = await tx.inventory.upsert({
        where: {
          warehouseId_productId: { warehouseId, productId: item.productId },
        },
        update: {
          availableQty: item.availableQty,
          ...(item.reservedQty !== undefined && { reservedQty: item.reservedQty }),
          reorderLevel: item.reorderLevel,
        },
        create: {
          warehouseId,
          productId: item.productId,
          availableQty: item.availableQty,
          reservedQty: item.reservedQty ?? 0,
          reorderLevel: item.reorderLevel,
        },
        include: { product: { select: { sku: true, name: true } } },
      });
      updatedRows.push(inv);
    }
    return updatedRows;
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Inventory",
    entityId: warehouse.id,
    action: "STOCK_LEVELS_BATCH_SET",
    newValue: {
      warehouse: warehouse.code,
      updatedSkusCount: results.length,
      items: input.items.map((i) => ({ productId: i.productId, availableQty: i.availableQty })),
    },
    reason: "Multi-SKU stock levels batch updated via admin panel",
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { warehouseId, updatedCount: results.length, inventory: results },
      `Stock levels updated for ${results.length} products in ${warehouse.code}`
    )
  );
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

/**
 * Ensure all existing warehouses have pair weights configured.
 * Automatically backfills missing pairs with baseline weights.
 */
async function ensurePairwiseWeights() {
  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    select: { id: true, shippingWeight: true },
  });

  if (warehouses.length < 2) return;

  const existingRoutes = await prisma.warehouseShippingWeight.findMany({
    select: { fromWarehouseId: true, toWarehouseId: true },
  });

  const existingSet = new Set(
    existingRoutes.map((r) => `${r.fromWarehouseId}_${r.toWarehouseId}`)
  );

  const missing = [];
  for (const w1 of warehouses) {
    for (const w2 of warehouses) {
      if (w1.id === w2.id) continue;
      const key = `${w1.id}_${w2.id}`;
      if (!existingSet.has(key)) {
        const defaultWeight = Math.max(1, Number(w1.shippingWeight || 1));
        missing.push({
          fromWarehouseId: w1.id,
          toWarehouseId: w2.id,
          weight: defaultWeight,
        });
      }
    }
  }

  if (missing.length > 0) {
    await prisma.warehouseShippingWeight.createMany({
      data: missing,
      skipDuplicates: true,
    });
  }
}

/**
 * GET /api/warehouses/shipping-weights
 * Returns all pairwise shipping weights and a 2D matrix.
 */
export const getShippingWeights = asyncHandler(async (req, res) => {
  await ensurePairwiseWeights();

  const warehouses = await prisma.warehouse.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, code: true, name: true, address: true },
  });

  const routes = await prisma.warehouseShippingWeight.findMany({
    include: {
      fromWarehouse: { select: { id: true, code: true, name: true } },
      toWarehouse: { select: { id: true, code: true, name: true } },
    },
    orderBy: [
      { fromWarehouse: { name: "asc" } },
      { toWarehouse: { name: "asc" } },
    ],
  });

  // Build 2D matrix structure: matrix[fromId][toId] = weight
  const matrix = {};
  for (const w of warehouses) {
    matrix[w.id] = {};
    for (const other of warehouses) {
      matrix[w.id][other.id] = w.id === other.id ? 0 : null;
    }
  }

  for (const r of routes) {
    if (matrix[r.fromWarehouseId]) {
      matrix[r.fromWarehouseId][r.toWarehouseId] = Number(r.weight);
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        warehouses,
        routes: routes.map((r) => ({
          id: r.id,
          fromWarehouseId: r.fromWarehouseId,
          fromCode: r.fromWarehouse.code,
          fromName: r.fromWarehouse.name,
          toWarehouseId: r.toWarehouseId,
          toCode: r.toWarehouse.code,
          toName: r.toWarehouse.name,
          weight: Number(r.weight),
        })),
        matrix,
      },
      "Shipping weights retrieved successfully"
    )
  );
});

const updateShippingWeightSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  weight: z.number().min(0, "Weight cannot be negative"),
  bidirectional: z.boolean().optional().default(true),
});

/**
 * PUT /api/warehouses/shipping-weights
 * Updates the shipping weight for a pair of warehouses (bidirectional by default)
 */
export const updateShippingWeight = asyncHandler(async (req, res) => {
  const { fromWarehouseId, toWarehouseId, weight, bidirectional } =
    updateShippingWeightSchema.parse(req.body);

  if (fromWarehouseId === toWarehouseId) {
    throw new ApiError(400, "Cannot configure shipping weight to the same warehouse");
  }

  const result = await prisma.$transaction(async (tx) => {
    const route1 = await tx.warehouseShippingWeight.upsert({
      where: {
        fromWarehouseId_toWarehouseId: { fromWarehouseId, toWarehouseId },
      },
      create: { fromWarehouseId, toWarehouseId, weight },
      update: { weight },
    });

    let route2 = null;
    if (bidirectional) {
      route2 = await tx.warehouseShippingWeight.upsert({
        where: {
          fromWarehouseId_toWarehouseId: {
            fromWarehouseId: toWarehouseId,
            toWarehouseId: fromWarehouseId,
          },
        },
        create: {
          fromWarehouseId: toWarehouseId,
          toWarehouseId: fromWarehouseId,
          weight,
        },
        update: { weight },
      });
    }

    return { route1, route2 };
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "WarehouseShippingWeight",
    entityId: result.route1.id,
    action: "SHIPPING_WEIGHT_UPDATED",
    newValue: { fromWarehouseId, toWarehouseId, weight, bidirectional },
    reason: "Updated pairwise shipping weight via admin matrix",
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Shipping weight between warehouses updated to ${weight}`
    )
  );
});

export default {
  getWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  setInventory,
  getWarehouseInventory,
  batchSetInventory,
  getStockOverview,
  getShippingWeights,
  updateShippingWeight,
};
