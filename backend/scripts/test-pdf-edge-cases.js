// ============================================================================
// DealFlow360 — PDF §2.11 Edge Cases Verification Suite
// Validates EVERY edge case from DealFlow360_Hero_Feature_1_and_2_Explained_Optimized.pdf
// ============================================================================

import { resolveCeiling } from '../rules/resolveCeiling.js';
import { scoreQuotation } from '../rules/scoreQuotation.js';
import { calculateRiskScore } from '../rules/riskEngine.js';
import { selectApprovalPolicySteps } from '../rules/selectApprovalPolicySteps.js';
import { STANDARD_APPROVAL_POLICY, CUSTOMER_TIER_GOLD } from '../fixtures/riskFixtures.js';

console.log(`======================================================================`);
console.log(`TESTING PDF §2.11 HERO FEATURE 1 EDGE CASES FOR RISK ENGINE`);
console.log(`======================================================================\n`);

let passedCount = 0;
let totalCount = 0;

function assert(condition, testName, details = '') {
  totalCount++;
  if (condition) {
    console.log(`✔ [PASS] ${testName}`);
    if (details) console.log(`   └─ ${details}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   └─ ${details}`);
  }
}

// ----------------------------------------------------------------------------
// Edge Case 1: Discount > 100% (PDF §2.11: "Reject before risk calculation")
// ----------------------------------------------------------------------------
{
  const line = { categoryId: 'cat_hw', unitPrice: 100, referencePrice: 100, discountPercent: 125 };
  const ceilingRes = resolveCeiling(line, CUSTOMER_TIER_GOLD);
  const score = scoreQuotation([{ ...line, ...ceilingRes, quantity: 1, unitCost: 50 }]);
  const risk = calculateRiskScore({}, score);

  assert(
    ceilingRes.validationError !== null && risk.recommendedRoute.includes('Rejected'),
    'Edge Case 1: Discount > 100% is flagged and rejected pre-calculation',
    risk.explanation[0]
  );
}

// ----------------------------------------------------------------------------
// Edge Case 2: Negative discount (PDF §2.11: "Reject unless surcharge behavior is explicitly modeled")
// ----------------------------------------------------------------------------
{
  const line = { categoryId: 'cat_hw', unitPrice: 100, referencePrice: 100, discountPercent: -15 };
  const ceilingRes = resolveCeiling(line, CUSTOMER_TIER_GOLD);
  const score = scoreQuotation([{ ...line, ...ceilingRes, quantity: 1, unitCost: 50 }]);
  const risk = calculateRiskScore({}, score);

  assert(
    ceilingRes.validationError !== null && risk.recommendedRoute.includes('Rejected'),
    'Edge Case 2: Negative discount is flagged and rejected',
    risk.explanation[0]
  );
}

// ----------------------------------------------------------------------------
// Edge Case 3: Missing product cost (PDF §2.11: "Do not assume zero cost; mark margin unknown and require review if margin is a gate")
// ----------------------------------------------------------------------------
{
  const line = {
    categoryId: 'cat_services',
    unitPrice: 500,
    referencePrice: 500,
    discountPercent: 5,
    effectiveCeilingPercent: 10,
    minMarginPercent: 25, // Margin floor gate active
    unitCost: null,       // Cost missing!
  };
  const score = scoreQuotation([line]);
  const risk = calculateRiskScore({}, score);

  assert(
    score.findings[0].isMarginUnknown === true &&
    score.marginFloorBreached === true &&
    risk.factors.marginBreach >= 30,
    'Edge Case 3: Missing product cost marks margin unknown and enforces review gate',
    `isMarginUnknown: ${score.findings[0].isMarginUnknown}, marginBreached: ${score.marginFloorBreached}, marginFactor: ${risk.factors.marginBreach}`
  );
}

// ----------------------------------------------------------------------------
// Edge Case 4: Price lowered instead of discount (PDF §2.5 & §2.11 Anti-Bypass)
// ----------------------------------------------------------------------------
{
  const line = {
    categoryId: 'cat_hw',
    referencePrice: 100000,
    unitPrice: 75000, // ₹25,000 hidden price discount (25%)
    discountPercent: 0,
  };
  const ceilingRes = resolveCeiling(line, CUSTOMER_TIER_GOLD, [
    { customerTierId: CUSTOMER_TIER_GOLD.id, categoryId: 'cat_hw', maxDiscountPercent: 15 },
  ]);

  assert(
    ceilingRes.isBypassed === true &&
    ceilingRes.effectiveDiscountPercent === 25.0 &&
    ceilingRes.effectiveCeilingPercent === 15.0,
    'Edge Case 4: Price lowered directly is caught as 25% effective discount',
    `Detected discount: ${ceilingRes.effectiveDiscountPercent}% vs ceiling: ${ceilingRes.effectiveCeilingPercent}%`
  );
}

// ----------------------------------------------------------------------------
// Edge Case 5: One risky line hidden inside many safe lines (PDF §2.11 & PRD M3)
// ----------------------------------------------------------------------------
{
  const lines = [
    { id: '1', productName: 'Big Safe Server', unitPrice: 1000000, referencePrice: 1000000, discountPercent: 5, effectiveCeilingPercent: 15, quantity: 1, unitCost: 700000 },
    { id: '2', productName: 'Tiny Sneaky Service', unitPrice: 200, referencePrice: 200, discountPercent: 30, effectiveCeilingPercent: 10, quantity: 1, unitCost: 100 }, // 20 pts overage!
  ];
  const score = scoreQuotation(lines);
  const routing = selectApprovalPolicySteps(STANDARD_APPROVAL_POLICY, score);

  assert(
    score.worstLineOverage === 20 &&
    routing.requiresApproval === true &&
    routing.matchedSteps.some((s) => s.roleCode === 'FINANCE'),
    'Edge Case 5: Severe single-line breach inside ₹10L order is caught by worstLineOverage',
    `worstLineOverage: ${score.worstLineOverage} pts -> Routed to Finance (20 >= 15)`
  );
}

// ----------------------------------------------------------------------------
// Edge Case 6: Different product/category limits (PDF §2.4: Strictest limit MIN)
// ----------------------------------------------------------------------------
{
  // Gold Tier (15%), Category Rule (10%), Tier x Cat Override (8%)
  const line = { categoryId: 'cat_spec', unitPrice: 100, referencePrice: 100, discountPercent: 9 };
  const ceilingRes = resolveCeiling(
    line,
    { id: 'tier_gold', maxDiscountPercent: 15 },
    [
      { customerTierId: null, categoryId: 'cat_spec', maxDiscountPercent: 10 },
      { customerTierId: 'tier_gold', categoryId: 'cat_spec', maxDiscountPercent: 8 },
    ]
  );

  assert(
    ceilingRes.effectiveCeilingPercent === 8.0,
    'Edge Case 6: Strictest limit algorithm picks MIN(15, 10, 8) = 8%',
    `Resolved ceiling: ${ceilingRes.effectiveCeilingPercent}%`
  );
}

// ----------------------------------------------------------------------------
// Edge Case 7: High Deal Value Exposure Factor (PDF §2.6)
// ----------------------------------------------------------------------------
{
  const quoteSmall = { grandTotal: 25000 };
  const quoteLarge = { grandTotal: 2500000 }; // ₹25,00,000
  const scoreVerd = { worstLineOverage: 0, blendedScore: 0, marginFloorBreached: false, totalValue: 2500000 };

  const riskSmall = calculateRiskScore(quoteSmall, { ...scoreVerd, totalValue: 25000 });
  const riskLarge = calculateRiskScore(quoteLarge, scoreVerd);

  assert(
    riskLarge.factors.dealValue === 15 && riskSmall.factors.dealValue === 0,
    'Edge Case 7: Deals >= ₹10L receive maximum 15 pts deal value risk factor',
    `Small quote value factor: ${riskSmall.factors.dealValue} | Large quote value factor: ${riskLarge.factors.dealValue}`
  );
}

// ----------------------------------------------------------------------------
// Edge Case 8: Multiple Violations Factor (PDF §2.6)
// ----------------------------------------------------------------------------
{
  const multiViolationLines = [
    { id: '1', unitPrice: 100, referencePrice: 100, discountPercent: 20, effectiveCeilingPercent: 10, quantity: 1, unitCost: 50 },
    { id: '2', unitPrice: 100, referencePrice: 100, discountPercent: 20, effectiveCeilingPercent: 10, quantity: 1, unitCost: 50 },
    { id: '3', unitPrice: 100, referencePrice: 100, discountPercent: 20, effectiveCeilingPercent: 10, quantity: 1, unitCost: 50 },
  ];
  const score = scoreQuotation(multiViolationLines);
  const risk = calculateRiskScore({}, score);

  assert(
    risk.factors.multipleViolations === 10,
    'Edge Case 8: >= 3 violating lines scales multi-violation factor to 10 pts',
    `Violations factor: ${risk.factors.multipleViolations} pts`
  );
}

// ----------------------------------------------------------------------------
// Edge Case 9: Clean quote auto-approve (PRD M4: Zero False Alarms)
// ----------------------------------------------------------------------------
{
  const cleanLines = [
    { id: '1', unitPrice: 900, referencePrice: 1000, discountPercent: 10, effectiveCeilingPercent: 15, quantity: 1, unitCost: 700 },
  ];
  const score = scoreQuotation(cleanLines);
  const risk = calculateRiskScore({ grandTotal: 900 }, score);
  const routing = selectApprovalPolicySteps(STANDARD_APPROVAL_POLICY, score);

  assert(
    routing.requiresApproval === false && risk.riskBand === 'LOW',
    'Edge Case 9: Clean quote has 0 overage and is Auto-approved',
    `Risk Band: ${risk.riskBand} | Requires Approval: ${routing.requiresApproval}`
  );
}

console.log(`\n======================================================================`);
console.log(`TOTAL EDGE CASES TESTED: ${totalCount} | PASSED: ${passedCount} | FAILED: ${totalCount - passedCount}`);
if (passedCount === totalCount) {
  console.log(`🎉 ALL PDF §2.11 EDGE CASES PASSED WITH 100% ACCURACY!`);
} else {
  console.error(`💥 SOME EDGE CASES FAILED!`);
  process.exit(1);
}
console.log(`======================================================================\n`);
