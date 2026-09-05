// ============================================================================
// DealFlow360 — Pure Rule Function: scoreQuotation
// Calculates line-level overages, blended quotation score, and margin health.
// PURE FUNCTION: Zero database or Prisma dependencies.
// ============================================================================

import { toNumber, round } from '../lib/money.js';

/**
 * Evaluates and scores all quotation lines against their resolved ceilings.
 *
 * Formulas:
 *   overage_i = max(0, effective_discount_i - effective_ceiling_i)
 *   worstLineOverage = max(overage_i)
 *   blendedScore (VALUE_WEIGHTED) = Σ(overage_i × line_value_i) / Σ(line_value_i)
 *
 * @param {Array<Object>} lines - Array of quotation lines with resolved ceilings
 * @param {Object} [options={}] - Scoring options
 * @param {string} [options.scoreStrategy='VALUE_WEIGHTED'] - VALUE_WEIGHTED | SUM_OF_POINTS | ABSOLUTE_MARGIN
 *
 * @returns {Object} Quotation evaluation score
 */
export function scoreQuotation(lines = [], options = {}) {
  const strategy = options?.scoreStrategy || 'VALUE_WEIGHTED';

  if (!lines || lines.length === 0) {
    return {
      blendedScore: 0.0,
      worstLineOverage: 0.0,
      marginFloorBreached: false,
      totalValue: 0.0,
      findings: [],
    };
  }

  let totalValue = 0;
  let weightedOverageSum = 0;
  let pointsSum = 0;
  let absoluteMarginOverageSum = 0;
  let worstLineOverage = 0;
  let marginFloorBreached = false;

  const findings = lines.map((line, index) => {
    const quantity = Math.max(1, toNumber(line?.quantity, 1));
    const unitPrice = toNumber(line?.unitPrice, 0);
    // PDF §2.11 Edge Case 3: Missing product cost check
    // "Do not assume zero cost; mark margin unknown and require review if margin is a gate"
    const hasMissingCost =
      line?.unitCost === null ||
      line?.unitCost === undefined ||
      line?.isCostMissing === true;

    const unitCost = hasMissingCost ? 0 : toNumber(line?.unitCost, 0);
    const referencePrice = toNumber(
      line?.referencePrice ?? line?.basePrice,
      unitPrice
    );

    const lineValue = (referencePrice > 0 ? referencePrice : unitPrice) * quantity;
    totalValue += lineValue;

    const discountPercent = toNumber(
      line?.effectiveDiscountPercent ?? line?.discountPercent,
      0
    );
    const effectiveCeilingPercent = toNumber(line?.effectiveCeilingPercent, 0);

    const overagePts = round(Math.max(0, discountPercent - effectiveCeilingPercent), 2);
    worstLineOverage = Math.max(worstLineOverage, overagePts);

    weightedOverageSum += overagePts * lineValue;
    pointsSum += overagePts;
    absoluteMarginOverageSum += (overagePts / 100) * lineValue;

    let lineMarginPercent = 0;
    let isMarginUnknown = false;
    const minMarginPercent = toNumber(line?.minMarginPercent, 0);
    let lineMarginBreached = false;

    if (hasMissingCost) {
      isMarginUnknown = true;
      // If a minimum margin floor is required, missing cost must trigger margin gate
      if (minMarginPercent > 0) {
        lineMarginBreached = true;
        marginFloorBreached = true;
      }
    } else {
      if (unitPrice > 0) {
        lineMarginPercent = round(((unitPrice - unitCost) / unitPrice) * 100, 2);
      }
      lineMarginBreached =
        minMarginPercent > 0 && lineMarginPercent < minMarginPercent;

      if (lineMarginBreached) {
        marginFloorBreached = true;
      }
    }

    return {
      lineId: line?.id || `line_${index + 1}`,
      productId: line?.productId || null,
      productName: line?.productName || line?.product?.name || `Item ${index + 1}`,
      quantity,
      unitPrice: round(unitPrice, 2),
      unitCost: hasMissingCost ? null : round(unitCost, 2),
      isMarginUnknown,
      discountPercent: round(discountPercent, 2),
      effectiveCeilingPercent: round(effectiveCeilingPercent, 2),
      overagePts: round(overagePts, 2),
      lineMarginPercent: isMarginUnknown ? null : round(lineMarginPercent, 2),
      minMarginPercent: round(minMarginPercent, 2),
      marginBreached: lineMarginBreached,
      lineValue: round(lineValue, 2),
      validationError: line?.validationError || null,
    };
  });

  let blendedScore = 0;
  switch (strategy) {
    case 'SUM_OF_POINTS':
      blendedScore = pointsSum;
      break;
    case 'ABSOLUTE_MARGIN':
      blendedScore = absoluteMarginOverageSum;
      break;
    case 'VALUE_WEIGHTED':
    default:
      blendedScore = totalValue > 0 ? weightedOverageSum / totalValue : 0;
      break;
  }

  return {
    blendedScore: round(blendedScore, 2),
    worstLineOverage: round(worstLineOverage, 2),
    marginFloorBreached,
    totalValue: round(totalValue, 2),
    findings,
  };
}
