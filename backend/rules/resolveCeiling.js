// ============================================================================
// DealFlow360 — Pure Rule Function: resolveCeiling
// Computes the strictest applicable discount ceiling and detects anti-bypass.
// PURE FUNCTION: Zero database or Prisma dependencies.
// ============================================================================

import { toNumber, round } from '../lib/money.js';

/**
 * Resolves the effective discount ceiling and checks anti-bypass for a line.
 *
 * Algorithm from DealFlow360_Hero_Feature_1_and_2_Explained_Optimized.pdf §2.4, §2.5:
 *   effective_limit = MIN(customer_limit, product_limit, category_limit, ...)
 *   effective_discount = 1 - (selling_price / reference_price)
 *
 * Precedence / Strictest resolution:
 *   1. DiscountRule (tier, category)    - most specific
 *   2. DiscountRule (null, category)    - category-wide
 *   3. DiscountRule (tier, null)        - tier-wide
 *   4. CustomerTier.maxDiscountPercent  - customer tier ceiling
 *   5. GovernanceSetting.unconfiguredCeilingPolicy (DENY => 0%, TIER_ONLY, PERMISSIVE => 100%)
 *
 * @param {Object} line - Quotation line input
 * @param {string} line.categoryId - Product category ID
 * @param {number} [line.unitPrice] - Offered selling price per unit
 * @param {number} [line.referencePrice] - Base/list price per unit
 * @param {number} [line.discountPercent] - Explicit discount percentage entered
 * @param {Object|null} tier - CustomerTier row
 * @param {string} [tier.id]
 * @param {number} [tier.maxDiscountPercent]
 * @param {Array<Object>} [discountRules=[]] - Active DiscountRule rows
 * @param {Object} [governanceSetting={}] - Singleton GovernanceSetting
 * @param {string} [governanceSetting.unconfiguredCeilingPolicy='DENY'] - DENY | TIER_ONLY | PERMISSIVE
 *
 * @returns {Object} Resolution result:
 *   {
 *     effectiveCeilingPercent: number,
 *     effectiveDiscountPercent: number,
 *     minMarginPercent: number,
 *     isBypassed: boolean,
 *     matchedRules: Array<Object>
 *   }
 */
export function resolveCeiling(
  line,
  tier = null,
  discountRules = [],
  governanceSetting = {}
) {
  const lineCategoryId = line?.categoryId || null;
  const tierId = tier?.id || null;
  const enteredDiscount = toNumber(line?.discountPercent, 0);

  // PDF §2.11 Edge Cases 1 & 2: Discount boundary checks
  let validationError = null;
  if (enteredDiscount > 100) {
    validationError = 'Discount cannot exceed 100% (PDF §2.11: Rejected before risk calculation)';
  } else if (enteredDiscount < 0) {
    validationError = 'Negative discount is rejected unless surcharge is explicitly modeled (PDF §2.11)';
  }

  // 1. Anti-Bypass Check (PDF §2.5)
  // Check if rep discounted the selling price directly without entering discount %
  const referencePrice = toNumber(line?.referencePrice ?? line?.basePrice, 0);
  const unitPrice = toNumber(line?.unitPrice, referencePrice);

  let calculatedPriceDiscount = 0;
  if (referencePrice > 0 && unitPrice < referencePrice) {
    calculatedPriceDiscount = ((referencePrice - unitPrice) / referencePrice) * 100;
  }

  // Effective discount is the maximum between explicit % and price-derived %
  const effectiveDiscountPercent = round(
    Math.max(enteredDiscount, calculatedPriceDiscount),
    2
  );
  const isBypassed = calculatedPriceDiscount > enteredDiscount + 0.05;

  // 2. Match Active Discount Rules
  const activeRules = (discountRules || []).filter(
    (rule) => rule && rule.isActive !== false
  );

  const matchedRules = activeRules.filter((rule) => {
    const matchesTier = rule.customerTierId ? rule.customerTierId === tierId : true;
    const matchesCategory = rule.categoryId ? rule.categoryId === lineCategoryId : true;

    // Must match at least tier or category specifically
    const isSpecificMatch =
      (rule.customerTierId === tierId && rule.categoryId === lineCategoryId) ||
      (!rule.customerTierId && rule.categoryId === lineCategoryId) ||
      (rule.customerTierId === tierId && !rule.categoryId);

    return matchesTier && matchesCategory && isSpecificMatch;
  });

  // 3. Strictest Limit Algorithm (MIN of all applicable ceilings)
  const candidateLimits = [];

  for (const rule of matchedRules) {
    if (rule.maxDiscountPercent !== null && rule.maxDiscountPercent !== undefined) {
      candidateLimits.push(toNumber(rule.maxDiscountPercent));
    }
  }

  if (tier?.maxDiscountPercent !== null && tier?.maxDiscountPercent !== undefined) {
    candidateLimits.push(toNumber(tier.maxDiscountPercent));
  }

  let effectiveCeilingPercent;
  if (candidateLimits.length > 0) {
    effectiveCeilingPercent = Math.min(...candidateLimits);
  } else {
    // 4. Fallback when unconfigured
    const unconfiguredPolicy =
      governanceSetting?.unconfiguredCeilingPolicy || 'DENY';

    switch (unconfiguredPolicy) {
      case 'TIER_ONLY':
        effectiveCeilingPercent =
          tier?.maxDiscountPercent != null ? toNumber(tier.maxDiscountPercent) : 0;
        break;
      case 'PERMISSIVE':
        effectiveCeilingPercent = 100.0;
        break;
      case 'DENY':
      default:
        effectiveCeilingPercent = 0.0;
        break;
    }
  }

  // 5. Min Margin Floor Resolution (Tie-broken by priority or highest requirement)
  let minMarginPercent = 0;
  if (matchedRules.length > 0) {
    const sortedByPriority = [...matchedRules].sort((a, b) => {
      const pA = toNumber(a.priority, 0);
      const pB = toNumber(b.priority, 0);
      if (pB !== pA) return pB - pA;
      return toNumber(b.minMarginPercent, 0) - toNumber(a.minMarginPercent, 0);
    });
    minMarginPercent = toNumber(sortedByPriority[0].minMarginPercent, 0);
  }

  return {
    effectiveCeilingPercent: round(effectiveCeilingPercent, 2),
    effectiveDiscountPercent: round(effectiveDiscountPercent, 2),
    minMarginPercent: round(minMarginPercent, 2),
    isBypassed,
    validationError,
    matchedRules,
  };
}
