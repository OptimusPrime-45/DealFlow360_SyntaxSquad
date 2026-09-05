import { toNumber, round, toNum, round2 } from "./money.js";

/**
 * Pure ceiling resolution engine.
 * Implements the "Strictest wins, then fall back" contract from architecture.md:
 *
 * 1. DiscountRule (tier, category)   — most specific
 * 2. DiscountRule (null, category)   — category-wide
 * 3. DiscountRule (tier, null)       — tier-wide
 * 4. CustomerTier.maxDiscountPercent — tier default ceiling
 * 5. GovernanceSetting.unconfiguredCeilingPolicy (DENY => 0%, PERMISSIVE => 100%)
 *
 * effectiveCeilingPercent = min(every rule that matched)
 */
export const resolveEffectiveCeiling = ({
  customerTier,
  categoryId,
  discountRules = [],
  unconfiguredPolicy = "DENY",
}) => {
  const matchedCeilings = [];
  let minMargin = 0;

  const tierId = customerTier?.id;

  // 1. Most specific: (tier, category)
  const ruleSpecific = discountRules.find(
    (r) => r.customerTierId === tierId && r.categoryId === categoryId && r.isActive !== false
  );
  if (ruleSpecific) {
    matchedCeilings.push(toNum(ruleSpecific.maxDiscountPercent));
    minMargin = Math.max(minMargin, toNum(ruleSpecific.minMarginPercent));
  }

  // 2. Category-wide: (null, category)
  const ruleCatWide = discountRules.find(
    (r) => !r.customerTierId && r.categoryId === categoryId && r.isActive !== false
  );
  if (ruleCatWide) {
    matchedCeilings.push(toNum(ruleCatWide.maxDiscountPercent));
    minMargin = Math.max(minMargin, toNum(ruleCatWide.minMarginPercent));
  }

  // 3. Tier-wide: (tier, null)
  const ruleTierWide = discountRules.find(
    (r) => r.customerTierId === tierId && !r.categoryId && r.isActive !== false
  );
  if (ruleTierWide) {
    matchedCeilings.push(toNum(ruleTierWide.maxDiscountPercent));
    minMargin = Math.max(minMargin, toNum(ruleTierWide.minMarginPercent));
  }

  // 4. CustomerTier.maxDiscountPercent
  if (customerTier && customerTier.maxDiscountPercent !== null && customerTier.maxDiscountPercent !== undefined) {
    matchedCeilings.push(toNum(customerTier.maxDiscountPercent));
  }

  // Resolution:
  let effectiveCeilingPercent;
  if (matchedCeilings.length > 0) {
    effectiveCeilingPercent = Math.min(...matchedCeilings);
  } else {
    // 5. Unconfigured policy
    if (unconfiguredPolicy === "PERMISSIVE") {
      effectiveCeilingPercent = 100.0;
    } else if (unconfiguredPolicy === "TIER_ONLY" && customerTier?.maxDiscountPercent) {
      effectiveCeilingPercent = toNum(customerTier.maxDiscountPercent);
    } else {
      // DENY (default)
      effectiveCeilingPercent = 0.0;
    }
  }

  return {
    effectiveCeilingPercent: round2(effectiveCeilingPercent),
    minMarginPercent: round2(minMargin),
  };
};

export default resolveEffectiveCeiling;
