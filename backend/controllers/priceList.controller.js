// ============================================================================
//  DealFlow360 — Price list configuration  (PDF §4-A2)
//
//  "Price Lists: Customer tier based pricing, currency specific rules."
//
//  A price list holds a per-product override of Product.basePrice. Note the
//  boundary: quotation lines currently snapshot from Product.basePrice, so a
//  price list is configuration the catalogue exposes rather than something the
//  quoting path consumes yet — see the note on GET /api/price-lists/resolve.
// ============================================================================

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const priceListSchema = z.object({
  name: z.string().min(1, "Price list name is required"),
  currency: z.string().min(1).default("INR"),
  isActive: z.boolean().optional().default(true),
});

const itemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  price: z.number().min(0, "Price must be zero or positive"),
});

/** GET /api/price-lists */
export const getPriceLists = asyncHandler(async (req, res) => {
  const priceLists = await prisma.priceList.findMany({
    include: {
      items: {
        include: { product: { select: { id: true, sku: true, name: true, basePrice: true } } },
      },
      _count: { select: { items: true } },
    },
    orderBy: { name: "asc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { priceLists }, "Price lists retrieved"));
});

/** POST /api/price-lists */
export const createPriceList = asyncHandler(async (req, res) => {
  const input = priceListSchema.parse(req.body);

  const existing = await prisma.priceList.findUnique({ where: { name: input.name } });
  if (existing) throw new ApiError(409, `A price list named "${input.name}" already exists`);

  const priceList = await prisma.priceList.create({ data: input, include: { items: true } });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "PriceList",
    entityId: priceList.id,
    action: "PRICE_LIST_CREATED",
    newValue: input,
    reason: "Price list created via backend configuration",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { priceList }, `Price list ${priceList.name} created`));
});

/** PATCH /api/price-lists/:id */
export const updatePriceList = asyncHandler(async (req, res) => {
  const input = priceListSchema.partial().parse(req.body);

  const existing = await prisma.priceList.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "Price list not found");

  const priceList = await prisma.priceList.update({
    where: { id: req.params.id },
    data: input,
    include: { items: true },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { priceList }, "Price list updated"));
});

/** DELETE /api/price-lists/:id */
export const deletePriceList = asyncHandler(async (req, res) => {
  const existing = await prisma.priceList.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "Price list not found");

  // Items cascade with the list (schema onDelete: Cascade).
  await prisma.priceList.delete({ where: { id: req.params.id } });

  return res.status(200).json(new ApiResponse(200, {}, "Price list deleted"));
});

/**
 * PUT /api/price-lists/:id/items
 * Upsert one product's price on this list.
 */
export const setPriceListItem = asyncHandler(async (req, res) => {
  const { id: priceListId } = req.params;
  const input = itemSchema.parse(req.body);

  const list = await prisma.priceList.findUnique({ where: { id: priceListId } });
  if (!list) throw new ApiError(404, "Price list not found");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new ApiError(400, "Product not found");

  const item = await prisma.priceListItem.upsert({
    where: {
      priceListId_productId: { priceListId, productId: input.productId },
    },
    update: { price: input.price },
    create: { priceListId, productId: input.productId, price: input.price },
    include: { product: { select: { sku: true, name: true, basePrice: true } } },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "PriceListItem",
    entityId: item.id,
    action: "PRICE_LIST_ITEM_SET",
    newValue: { priceList: list.name, sku: product.sku, price: input.price },
    reason: "Price list entry set",
  });

  return res.status(200).json(new ApiResponse(200, { item }, "Price set"));
});

/** DELETE /api/price-lists/:id/items/:itemId */
export const deletePriceListItem = asyncHandler(async (req, res) => {
  const item = await prisma.priceListItem.findFirst({
    where: { id: req.params.itemId, priceListId: req.params.id },
  });
  if (!item) throw new ApiError(404, "Price list entry not found");

  await prisma.priceListItem.delete({ where: { id: item.id } });

  return res.status(200).json(new ApiResponse(200, {}, "Price list entry removed"));
});

export default {
  getPriceLists,
  createPriceList,
  updatePriceList,
  deletePriceList,
  setPriceListItem,
  deletePriceListItem,
};
