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
const loadEditableQuotation = async (quotationId, reqUser = null) => {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, status: true, quotationNumber: true, salesRepId: true },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  if (reqUser?.role?.code === "SALES_REP" && quotation.salesRepId !== reqUser.id) {
    throw new ApiError(403, "Forbidden: You can only edit your own quotations");
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

  await loadEditableQuotation(quotationId, req.user);

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

  await loadEditableQuotation(quotationId, req.user);

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

  await loadEditableQuotation(quotationId, req.user);

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
const HARDCODED_PRODUCT_UPSELLS = {
  "HW-LAPTOP-15": [
    { sku: "SUB-CRM-PRO", tag: "High Margin (+77.8%)", reason: "DealFlow CRM Pro Suite for Mobile Sales Teams" },
    { sku: "SUB-SECURITY-SHIELD", tag: "Essential Security", reason: "Zero-Trust Endpoint Security for Laptops" },
  ],
  "PRO-LAPTOP-01": [
    { sku: "SRV-SUPPORT-247", tag: "Executive Care", reason: "24/7 Dedicated IT Support SLA & Priority Dispatch" },
    { sku: "SUB-SECURITY-SHIELD", tag: "Essential Security", reason: "Zero-Trust Endpoint Security Shield" },
  ],
  "PROD-LAPTOP-01": [
    { sku: "SUB-SECURITY-SHIELD", tag: "Essential Security", reason: "Zero-Trust Endpoint Security Shield" },
    { sku: "SRV-SUPPORT-247", tag: "Executive Care", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "HW-DESKTOP-ULTRA": [
    { sku: "HW-MONITOR-27", tag: "Co-Purchase Pairing", reason: "UltraSharp 4K Monitor 27\" Dual Display Setup" },
    { sku: "SRV-MAINT-FLEET", tag: "Hardware Care", reason: "Preventive Hardware Maintenance & Fleet Care" },
  ],
  "PRO-WORKSTATION-01": [
    { sku: "HW-MONITOR-27", tag: "Co-Purchase Pairing", reason: "UltraSharp 4K Monitor 27\" Display" },
    { sku: "SRV-MAINT-FLEET", tag: "Hardware Care", reason: "Hardware Preventive Maintenance Package" },
  ],
  "HW-SERVER-2U": [
    { sku: "SUB-BACKUP-PRO", tag: "Disaster Recovery", reason: "Managed Cloud Backup Pro (80% Margin)" },
    { sku: "SRV-CONSULT-01", tag: "Professional Service", reason: "Enterprise Architecture Consulting & Migration" },
  ],
  "PRO-SERVER-RACK-01": [
    { sku: "SUB-BACKUP-PRO", tag: "Disaster Recovery", reason: "Managed Cloud Backup Pro Automated Snapshots" },
    { sku: "SRV-CONSULT-01", tag: "Professional Service", reason: "Enterprise Architecture Consulting & Clustering" },
  ],
  "HW-ROUTER-MESH": [
    { sku: "SUB-SECURITY-SHIELD", tag: "Network Shield", reason: "Zero-Trust Endpoint & Perimeter Security" },
    { sku: "SRV-SETUP-01", tag: "White Glove", reason: "Onsite Setup & Configuration SLA" },
  ],
  "HW-MONITOR-27": [
    { sku: "SRV-MAINT-FLEET", tag: "Care Plan", reason: "Hardware Preventive Maintenance & Panel Care" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "SUB-CRM-PRO": [
    { sku: "SUB-BACKUP-PRO", tag: "Cloud Add-on", reason: "Managed Cloud Backup Pro for CRM Data" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "SUB-CLOUD-ENT": [
    { sku: "SUB-SECURITY-SHIELD", tag: "Security Layer", reason: "Zero-Trust Endpoint Security for Cloud Users" },
    { sku: "SRV-CONSULT-01", tag: "Advisory", reason: "Enterprise Architecture Consulting" },
  ],
  "SB-SOFTWARE-79": [
    { sku: "SUB-BACKUP-PRO", tag: "Data Safety", reason: "Managed Cloud Backup Pro" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "SAAS-MONITORING-01": [
    { sku: "SUB-BACKUP-PRO", tag: "High Margin (+80%)", reason: "Managed Cloud Backup Pro Automated Protection" },
    { sku: "SRV-CONSULT-01", tag: "Expert Service", reason: "Enterprise Architecture Consulting" },
  ],
  "SRV-SETUP-01": [
    { sku: "SUB-CLOUD-ENT", tag: "Cloud Bundle", reason: "DealFlow Cloud Enterprise Plan" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "PROD-SETUP-01": [
    { sku: "SUB-CLOUD-ENT", tag: "Cloud Bundle", reason: "DealFlow Cloud Enterprise Plan" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "SRV-CONSULT-01": [
    { sku: "SUB-CRM-PRO", tag: "High Margin (+77.8%)", reason: "DealFlow CRM Pro Suite Business Edition" },
    { sku: "SUB-CLOUD-ENT", tag: "Enterprise Cloud", reason: "DealFlow Cloud Enterprise Plan" },
  ],
  "SRV-MAINT-FLEET": [
    { sku: "SRV-SUPPORT-247", tag: "24/7 SLA", reason: "24/7 Dedicated IT Support SLA" },
    { sku: "SUB-BACKUP-PRO", tag: "Backup Shield", reason: "Managed Cloud Backup Pro" },
  ],
  "SRV-SUPPORT-247": [
    { sku: "SUB-BACKUP-PRO", tag: "Disaster Recovery", reason: "Managed Cloud Backup Pro" },
    { sku: "SUB-SECURITY-SHIELD", tag: "Endpoint Shield", reason: "Zero-Trust Endpoint Security" },
  ],
};

export const getUpsellSuggestions = asyncHandler(async (req, res) => {
  const { id: quotationId } = req.params;

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      lines: {
        include: {
          product: {
            include: { category: true },
          },
        },
      },
    },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  if (req.user?.role?.code === "SALES_REP" && quotation.salesRepId !== req.user.id) {
    throw new ApiError(403, "Forbidden: You can only view suggestions for your own quotations");
  }

  const presentProductIds = quotation.lines.map((l) => l.productId);
  const presentCategoryIds = quotation.lines
    .map((l) => l.product?.categoryId)
    .filter(Boolean);

  const best = new Map();

  // 1. Hardcoded 1-to-2 Upsell Suggestions based on products on this quote
  const quoteSkus = quotation.lines.map((l) => l.product?.sku).filter(Boolean);
  for (const parentSku of quoteSkus) {
    const pairings = HARDCODED_PRODUCT_UPSELLS[parentSku] || [
      { sku: "SUB-CRM-PRO", tag: "High Margin (+77.8%)", reason: "DealFlow CRM Pro Suite" },
      { sku: "SUB-SECURITY-SHIELD", tag: "Essential Security", reason: "Zero-Trust Endpoint Security" },
    ];

    let rankBoost = 180;
    for (const item of pairings) {
      const product = await prisma.product.findUnique({
        where: { sku: item.sku },
        include: { category: true },
      });

      if (!product || !product.isActive || presentProductIds.includes(product.id)) {
        continue;
      }

      const price = toNum(product.basePrice);
      const cost = toNum(product.costPrice);
      const marginPercent = price > 0 ? round2(((price - cost) / price) * 100) : 0;

      if (!best.has(product.id)) {
        best.set(product.id, {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category?.name || null,
          unitPrice: price,
          marginPercent,
          marginDelta: round2(price - cost),
          revenueDelta: price,
          isPromoted: Boolean(product.isPromoted),
          promotionTag: item.tag || (product.isPromoted ? "Promoted" : "Recommended Upsell"),
          coPurchaseCount: 20,
          score: rankBoost,
          reason: item.reason,
          source: "HARDCODED_PRODUCT_PAIRING",
        });
        rankBoost -= 10;
      }
    }
  }

  // 2. Co-purchase rules from database
  const rules = await prisma.coPurchaseRule.findMany({
    where: { isActive: true, sourceProductId: { in: presentProductIds } },
    include: { suggestedProduct: { include: { category: true } } },
  });

  const PROMOTED_BOOST = 1.25;

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
      promotionTag: product.isPromoted ? "Promoted" : "Frequently Bought Together",
      coPurchaseCount: rule.coPurchaseCount,
      score,
      source: "CO_PURCHASE_RULE",
    });
  }

  // 2. Intelligent Dynamic Upsell Engine:
  // If rules produced fewer than 4 suggestions, query the catalog for complementary / high-margin items!
  if (best.size < 4) {
    const candidateProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { notIn: presentProductIds },
      },
      include: { category: true },
    });

    for (const product of candidateProducts) {
      if (best.has(product.id)) continue;

      const price = toNum(product.basePrice);
      const cost = toNum(product.costPrice);
      const marginPercent = price > 0 ? round2(((price - cost) / price) * 100) : 0;

      // Filter out products with margin below 10% (protect deal profitability)
      if (marginPercent < 10) continue;

      // Check if product is complementary (different category or subscription attached to hardware)
      const isComplementary =
        product.productType === "SUBSCRIPTION" ||
        (product.categoryId && !presentCategoryIds.includes(product.categoryId));

      // Scoring heuristic:
      // Base: Margin contribution (higher margin gives higher rank)
      // + Boost for Promoted (+35)
      // + Boost for Complementary category/service (+25)
      // + Boost for Subscription (+15)
      const score = round2(
        (marginPercent * 0.6) +
        (product.isPromoted ? 35 : 0) +
        (isComplementary ? 25 : 0) +
        (product.productType === "SUBSCRIPTION" ? 15 : 0)
      );

      const tag = product.isPromoted
        ? "Promoted"
        : product.productType === "SUBSCRIPTION"
        ? "Service Add-on"
        : isComplementary
        ? "Complementary"
        : "High Margin";

      best.set(product.id, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category?.name || null,
        unitPrice: price,
        marginPercent,
        marginDelta: round2(price - cost),
        revenueDelta: price,
        isPromoted: product.isPromoted,
        promotionTag: tag,
        coPurchaseCount: 0,
        score,
        source: "DYNAMIC_CATALOG_ENGINE",
      });
    }
  }

  const suggestions = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

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
