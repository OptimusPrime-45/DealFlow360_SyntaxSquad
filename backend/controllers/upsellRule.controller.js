// ============================================================================
//  DealFlow360 — Upsell / cross-sell rule configuration  (PDF §4-A6)
//
//  "Define product pairings based on historical co purchase data · Mark
//   products as currently promoted so they rank higher · Set minimum margin
//   thresholds so only healthy margin suggestions surface."
//
//  Ranking is coPurchaseCount x weight, boosted when the suggested product is
//  promoted. minMarginPercent hides thin-margin suggestions. The consuming
//  endpoint is GET /api/quotations/:id/suggestions.
// ============================================================================

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const ruleSchema = z.object({
  sourceProductId: z.string().min(1, "Source product is required"),
  suggestedProductId: z.string().min(1, "Suggested product is required"),
  // Stands in for observed co-purchase frequency; on a fresh database the
  // admin enters it by hand (PDF §4-A6 assumes history that does not exist yet).
  coPurchaseCount: z.number().int().min(0).default(0),
  weight: z.number().min(0).default(1),
  minMarginPercent: z.number().min(0).max(100).default(0),
  isActive: z.boolean().optional().default(true),
});

const productSummary = {
  select: { id: true, sku: true, name: true, isPromoted: true, basePrice: true, costPrice: true },
};

/** GET /api/upsell-rules */
export const getUpsellRules = asyncHandler(async (req, res) => {
  const rules = await prisma.coPurchaseRule.findMany({
    include: { sourceProduct: productSummary, suggestedProduct: productSummary },
    orderBy: [{ coPurchaseCount: "desc" }],
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { rules }, "Upsell rules retrieved"));
});

/** POST /api/upsell-rules */
export const createUpsellRule = asyncHandler(async (req, res) => {
  const input = ruleSchema.parse(req.body);

  if (input.sourceProductId === input.suggestedProductId) {
    throw new ApiError(400, "A product cannot be suggested alongside itself");
  }

  const [source, suggested] = await Promise.all([
    prisma.product.findUnique({ where: { id: input.sourceProductId } }),
    prisma.product.findUnique({ where: { id: input.suggestedProductId } }),
  ]);

  if (!source) throw new ApiError(400, "Source product not found");
  if (!suggested) throw new ApiError(400, "Suggested product not found");

  const existing = await prisma.coPurchaseRule.findUnique({
    where: {
      sourceProductId_suggestedProductId: {
        sourceProductId: input.sourceProductId,
        suggestedProductId: input.suggestedProductId,
      },
    },
  });

  if (existing) {
    throw new ApiError(
      409,
      `A pairing already exists from ${source.sku} to ${suggested.sku}; edit it instead`
    );
  }

  const rule = await prisma.coPurchaseRule.create({
    data: input,
    include: { sourceProduct: productSummary, suggestedProduct: productSummary },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "CoPurchaseRule",
    entityId: rule.id,
    action: "UPSELL_RULE_CREATED",
    newValue: { source: source.sku, suggested: suggested.sku, ...input },
    reason: "Upsell pairing created via backend configuration",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { rule }, `Pairing ${source.sku} → ${suggested.sku} created`));
});

/** PATCH /api/upsell-rules/:id */
export const updateUpsellRule = asyncHandler(async (req, res) => {
  const input = ruleSchema.partial().parse(req.body);

  const existing = await prisma.coPurchaseRule.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "Upsell rule not found");

  const rule = await prisma.coPurchaseRule.update({
    where: { id: req.params.id },
    data: input,
    include: { sourceProduct: productSummary, suggestedProduct: productSummary },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "CoPurchaseRule",
    entityId: rule.id,
    action: "UPSELL_RULE_UPDATED",
    oldValue: {
      coPurchaseCount: existing.coPurchaseCount,
      weight: existing.weight,
      minMarginPercent: existing.minMarginPercent,
      isActive: existing.isActive,
    },
    newValue: input,
    reason: "Upsell pairing updated",
  });

  return res.status(200).json(new ApiResponse(200, { rule }, "Upsell rule updated"));
});

/** DELETE /api/upsell-rules/:id */
export const deleteUpsellRule = asyncHandler(async (req, res) => {
  const existing = await prisma.coPurchaseRule.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "Upsell rule not found");

  await prisma.coPurchaseRule.delete({ where: { id: req.params.id } });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "CoPurchaseRule",
    entityId: req.params.id,
    action: "UPSELL_RULE_DELETED",
    oldValue: { sourceProductId: existing.sourceProductId, suggestedProductId: existing.suggestedProductId },
    reason: "Upsell pairing removed",
  });

  return res.status(200).json(new ApiResponse(200, {}, "Upsell rule deleted"));
});

export default {
  getUpsellRules,
  createUpsellRule,
  updateUpsellRule,
  deleteUpsellRule,
};
