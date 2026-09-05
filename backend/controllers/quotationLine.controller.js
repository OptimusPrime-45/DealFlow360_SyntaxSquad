// ============================================================================
//  DealFlow360 — Quotation line management + upsell suggestions
//
//  §9 step 4: "While building the quote, accept one upsell suggestion and
//  confirm the order total and margin update right away."
//
//  Every mutation here ends with recalculateQuotation(), so totals, margin,
//  blended score and worst-line overage are always consistent with the lines
//  actually on the quotation.
// ============================================================================

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { toNum, round2 } from "../lib/money.js";
import { recalculateQuotation } from "../services/quotationPricing.service.js";
import { recordAuditLog } from "../lib/audit.js";

// A quotation may only be edited while it is still the rep's to edit.
const EDITABLE_STATUSES = ["DRAFT", "REJECTED", "UNDER_NEGOTIATION"];

const addLineSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  productVariantId: z.string().optional().nullable(),
  subscriptionPlanId: z.string().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  discountPercent: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).default(0),
  addedViaUpsell: z.boolean().optional().default(false),
});

const updateLineSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  taxRate: z.number().min(0).optional(),
});

/** Load a quotation and assert it can still be edited. */
const loadEditableQuotation = async (quotationId) => {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, status: true, quotationNumber: true },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  if (!EDITABLE_STATUSES.includes(quotation.status)) {
    throw new ApiError(
      400,
      `Quotation ${quotation.quotationNumber} cannot be edited from status ${quotation.status}`
    );
  }

  return quotation;
};

/**
 * POST /api/quotations/:id/lines
 * Add a line. Used by the builder and by "Add to Quote" on the upsell panel.
 */
export const addQuotationLine = asyncHandler(async (req, res) => {
  const { id: quotationId } = req.params;
  const input = addLineSchema.parse(req.body);

  await loadEditableQuotation(quotationId);

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
  });
  if (!product) {
    throw new ApiError(400, `Product not found: ${input.productId}`);
  }

  const lastLine = await prisma.quotationLine.findFirst({
    where: { quotationId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  // Placeholder values — recalculateQuotation() immediately overwrites every
  // derived field below with the engine's answer.
  await prisma.quotationLine.create({
    data: {
      quotationId,
      productId: product.id,
      productVariantId: input.productVariantId || null,
      subscriptionPlanId: input.subscriptionPlanId || null,
      lineType: product.productType === "SUBSCRIPTION" ? "RECURRING" : "ONE_TIME",
      quantity: input.quantity,
      unitPrice: toNum(product.basePrice),
      unitCost: toNum(product.costPrice),
      effectiveCeilingPercent: 0,
      minMarginPercent: 0,
      discountPercent: input.discountPercent,
      taxRate: input.taxRate,
      overagePts: 0,
      lineTotal: 0,
      lineMarginPercent: 0,
      addedViaUpsell: input.addedViaUpsell,
      position: (lastLine?.position ?? -1) + 1,
    },
  });

  const quotation = await recalculateQuotation(quotationId);

  await recordAuditLog({
    userId: req.user?.id || null,
    quotationId,
    actorType: "USER",
    entityType: "QuotationLine",
    entityId: quotationId,
    action: input.addedViaUpsell ? "LINE_ADDED_VIA_UPSELL" : "LINE_ADDED",
    newValue: { productId: product.id, sku: product.sku, quantity: input.quantity },
    reason: input.addedViaUpsell ? "Upsell suggestion accepted" : "Line added to quotation",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { quotation }, "Line added and quotation re-scored"));
});

/**
 * PATCH /api/quotations/:id/lines/:lineId
 */
export const updateQuotationLine = asyncHandler(async (req, res) => {
  const { id: quotationId, lineId } = req.params;
  const input = updateLineSchema.parse(req.body);

  await loadEditableQuotation(quotationId);

  const line = await prisma.quotationLine.findFirst({
    where: { id: lineId, quotationId },
  });
  if (!line) {
    throw new ApiError(404, "Quotation line not found on this quotation");
  }

  await prisma.quotationLine.update({ where: { id: lineId }, data: input });

  const quotation = await recalculateQuotation(quotationId);

  await recordAuditLog({
    userId: req.user?.id || null,
    quotationId,
    actorType: "USER",
    entityType: "QuotationLine",
    entityId: lineId,
    action: "LINE_UPDATED",
    oldValue: {
      quantity: line.quantity,
      discountPercent: toNum(line.discountPercent),
    },
    newValue: input,
    reason: "Quotation line edited",
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { quotation }, "Line updated and quotation re-scored"));
});

/**
 * DELETE /api/quotations/:id/lines/:lineId
 */
export const deleteQuotationLine = asyncHandler(async (req, res) => {
  const { id: quotationId, lineId } = req.params;

  await loadEditableQuotation(quotationId);

  const line = await prisma.quotationLine.findFirst({
    where: { id: lineId, quotationId },
  });
  if (!line) {
    throw new ApiError(404, "Quotation line not found on this quotation");
  }

  const remaining = await prisma.quotationLine.count({ where: { quotationId } });
  if (remaining <= 1) {
    throw new ApiError(400, "A quotation must keep at least one line");
  }

  await prisma.quotationLine.delete({ where: { id: lineId } });
  const quotation = await recalculateQuotation(quotationId);

  await recordAuditLog({
    userId: req.user?.id || null,
    quotationId,
    actorType: "USER",
    entityType: "QuotationLine",
    entityId: lineId,
    action: "LINE_REMOVED",
    oldValue: { productId: line.productId, quantity: line.quantity },
    reason: "Quotation line removed",
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { quotation }, "Line removed and quotation re-scored"));
});

/**
 * GET /api/quotations/:id/suggestions   — §9 step 4, PDF §4-A6 / §4-B5
 *
 * Ranked upsell / cross-sell suggestions for what is currently on the quote.
 *
 * Ranking  = coPurchaseCount x weight, with a boost for promoted products.
 * Filtering: products already on the quotation are excluded, and a suggestion
 *            is hidden when its own margin falls below the rule's
 *            minMarginPercent — "only healthy margin suggestions surface".
 * Each suggestion reports the marginDelta it would add, so the rep sees the
 * commercial consequence before accepting.
 */
export const getUpsellSuggestions = asyncHandler(async (req, res) => {
  const { id: quotationId } = req.params;

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: { select: { productId: true } } },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  const presentProductIds = quotation.lines.map((l) => l.productId);

  const rules = await prisma.coPurchaseRule.findMany({
    where: { isActive: true, sourceProductId: { in: presentProductIds } },
    include: { suggestedProduct: { include: { category: true } } },
  });

  const PROMOTED_BOOST = 1.25;
  const best = new Map();

  for (const rule of rules) {
    const product = rule.suggestedProduct;

    // Never suggest something already on the quotation.
    if (!product || !product.isActive || presentProductIds.includes(product.id)) {
      continue;
    }

    const price = toNum(product.basePrice);
    const cost = toNum(product.costPrice);
    const marginPercent = price > 0 ? round2(((price - cost) / price) * 100) : 0;

    // Margin floor from the rule itself (PDF §4-A6).
    if (marginPercent < toNum(rule.minMarginPercent)) {
      continue;
    }

    const score = round2(
      rule.coPurchaseCount * toNum(rule.weight, 1) * (product.isPromoted ? PROMOTED_BOOST : 1)
    );

    // A product reachable from several lines keeps its strongest score.
    const existing = best.get(product.id);
    if (existing && existing.score >= score) continue;

    best.set(product.id, {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category?.name || null,
      unitPrice: price,
      marginPercent,
      // What accepting one unit would add to the deal's margin.
      marginDelta: round2(price - cost),
      revenueDelta: price,
      isPromoted: product.isPromoted,
      promotionTag: product.isPromoted ? "Promoted" : null,
      coPurchaseCount: rule.coPurchaseCount,
      score,
    });
  }

  const suggestions = [...best.values()].sort((a, b) => b.score - a.score);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { quotationId, suggestions },
        `${suggestions.length} upsell suggestion(s) available`
      )
    );
});

export default {
  addQuotationLine,
  updateQuotationLine,
  deleteQuotationLine,
  getUpsellSuggestions,
};
