// ============================================================================
//  DealFlow360 — Quotation pricing & rescoring service
//
//  Every time a quotation's lines change — a rep edits a discount, accepts an
//  upsell suggestion (§9 step 4), or a customer's counter-offer is applied
//  (§9 step 7) — the whole quotation must be re-priced and re-scored against
//  CURRENT configuration.
//
//  Doing it in one place is what keeps the promise in the architecture doc:
//  the number a quotation stores and the number that routes it come from the
//  same functions, every time, no matter which endpoint caused the change.
// ============================================================================

import { prisma } from "../lib/prisma.js";
import { calculateLineMath, round2, add, toNum } from "../lib/money.js";
import { resolveCeiling } from "../rules/resolveCeiling.js";
import { scoreQuotation } from "../rules/scoreQuotation.js";

/**
 * Load the governance configuration the engine needs. Read fresh on every call
 * and never cached — that is what makes "an admin changes a ceiling and the
 * next quote routes correctly, with no restart" true by construction.
 */
export async function loadGovernanceConfig() {
  const [governanceSetting, discountRules] = await Promise.all([
    prisma.governanceSetting.findUnique({ where: { id: "singleton" } }),
    prisma.discountRule.findMany({ where: { isActive: true } }),
  ]);

  return {
    governanceSetting: governanceSetting || { unconfiguredCeilingPolicy: "DENY" },
    discountRules,
  };
}

/**
 * Recompute every line's ceiling, overage and margin, then the quotation's
 * totals and governance verdict, and persist all of it.
 *
 * @param {string} quotationId
 * @returns {Promise<Object>} the refreshed quotation, lines included
 */
export async function recalculateQuotation(quotationId) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customerTier: true,
      lines: {
        include: { product: true, productVariant: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!quotation) {
    throw new Error(`Quotation ${quotationId} not found`);
  }

  const { governanceSetting, discountRules } = await loadGovernanceConfig();

  let subtotal = 0;
  let discountTotal = 0;
  let grandTotal = 0;
  let totalCost = 0;

  const lineUpdates = [];
  const scoringLines = [];

  for (const line of quotation.lines) {
    const extraPrice = line.productVariant ? toNum(line.productVariant.extraPrice) : 0;
    const listPrice = round2(toNum(line.product.basePrice) + extraPrice);
    const unitCost = round2(toNum(line.product.costPrice));
    const discountPercent = toNum(line.discountPercent);

    const ceiling = resolveCeiling(
      {
        categoryId: line.product.categoryId,
        referencePrice: listPrice,
        unitPrice: listPrice,
        discountPercent,
      },
      quotation.customerTier,
      discountRules,
      governanceSetting
    );

    const math = calculateLineMath({
      quantity: line.quantity,
      unitPrice: listPrice,
      unitCost,
      discountPercent,
    });

    const overagePts = Math.max(
      0,
      round2(ceiling.effectiveDiscountPercent - ceiling.effectiveCeilingPercent)
    );

    subtotal = add(subtotal, math.grossTotal);
    discountTotal = add(discountTotal, math.discountAmount);
    grandTotal = add(grandTotal, math.lineTotal);
    totalCost = add(totalCost, math.totalCost);

    scoringLines.push({
      productId: line.productId,
      productName: line.product.name,
      quantity: math.quantity,
      unitPrice: math.unitPrice,
      unitCost: math.unitCost,
      referencePrice: listPrice,
      discountPercent: math.discountPercent,
      effectiveDiscountPercent: ceiling.effectiveDiscountPercent,
      effectiveCeilingPercent: ceiling.effectiveCeilingPercent,
      minMarginPercent: ceiling.minMarginPercent,
    });

    lineUpdates.push({
      id: line.id,
      data: {
        unitPrice: math.unitPrice,
        unitCost: math.unitCost,
        effectiveCeilingPercent: ceiling.effectiveCeilingPercent,
        minMarginPercent: ceiling.minMarginPercent,
        overagePts,
        lineTotal: math.lineTotal,
        lineMarginPercent: math.marginPercent,
      },
    });
  }

  const marginAmount = round2(grandTotal - totalCost);
  const marginPercent = grandTotal > 0 ? round2((marginAmount / grandTotal) * 100) : 0;

  const verdict = scoreQuotation(scoringLines, {
    scoreStrategy: governanceSetting.scoreStrategy || "VALUE_WEIGHTED",
  });

  await prisma.$transaction([
    ...lineUpdates.map((u) =>
      prisma.quotationLine.update({ where: { id: u.id }, data: u.data })
    ),
    prisma.quotation.update({
      where: { id: quotationId },
      data: {
        subtotal,
        discountTotal,
        grandTotal,
        marginAmount,
        marginPercent,
        blendedScore: verdict.blendedScore,
        worstLineOverage: verdict.worstLineOverage,
        marginFloorBreached: verdict.marginFloorBreached,
        lastActivityAt: new Date(),
      },
    }),
  ]);

  return prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: true,
      customerTier: true,
      lines: {
        include: { product: { include: { category: true } }, productVariant: true, subscriptionPlan: true },
        orderBy: { position: "asc" },
      },
    },
  });
}

export default { recalculateQuotation, loadGovernanceConfig };
