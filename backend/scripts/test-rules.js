// ============================================================================
// DealFlow360 — Fixture & Pure Rules Verification Script
// Tests all 4 fixtures against resolveCeiling, scoreQuotation, and selectApprovalPolicySteps
// Run: node scripts/test-rules.js
// ============================================================================

import {
  FIXTURE_1_WORKED_EXAMPLE,
  FIXTURE_2_MANY_SMALL_VIOLATIONS,
  FIXTURE_3_CLEAN_QUOTE,
  FIXTURE_4_ANTI_BYPASS,
} from '../fixtures/riskFixtures.js';

import { resolveCeiling } from '../rules/resolveCeiling.js';
import { scoreQuotation } from '../rules/scoreQuotation.js';
import { selectApprovalPolicySteps } from '../rules/selectApprovalPolicySteps.js';
import { calculateRiskScore } from '../rules/riskEngine.js';

function runFixtureTest(fixture) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`TEST: ${fixture.name}`);
  console.log(`------------------------------------------------------------`);

  // 1. Resolve Ceilings & Check Anti-bypass on each line
  const resolvedLines = fixture.lines.map((line) => {
    const ceilingResult = resolveCeiling(
      line,
      fixture.tier,
      fixture.discountRules,
      fixture.setting
    );

    return {
      ...line,
      effectiveCeilingPercent: ceilingResult.effectiveCeilingPercent,
      effectiveDiscountPercent: ceilingResult.effectiveDiscountPercent,
      minMarginPercent: ceilingResult.minMarginPercent,
      isBypassed: ceilingResult.isBypassed,
    };
  });

  // 2. Score Quotation
  const scoreVerdict = scoreQuotation(resolvedLines, {
    scoreStrategy: fixture.setting?.scoreStrategy || 'VALUE_WEIGHTED',
  });

  console.log(`Summary:`);
  console.log(`  Blended Score:      ${scoreVerdict.blendedScore}`);
  console.log(`  Worst Line Overage: ${scoreVerdict.worstLineOverage}`);
  console.log(`  Margin Breached:    ${scoreVerdict.marginFloorBreached}`);
  console.log(`  Total Value:        ₹${scoreVerdict.totalValue}`);

  console.log(`Findings:`);
  scoreVerdict.findings.forEach((f) => {
    console.log(
      `  - [${f.productName}]: Disc=${f.discountPercent}% | Ceiling=${f.effectiveCeilingPercent}% | Overage=${f.overagePts} pts | Margin=${f.lineMarginPercent}%`
    );
  });

  // 3. Score Risk Engine (PDF §2.6)
  const riskVerdict = calculateRiskScore(
    { grandTotal: scoreVerdict.totalValue, customerTier: fixture.tier },
    scoreVerdict
  );

  console.log(`Risk Assessment:`);
  console.log(`  Risk Score:         ${riskVerdict.riskScore}/100 [${riskVerdict.riskBand}]`);
  console.log(`  Recommended Route:  ${riskVerdict.recommendedRoute}`);
  console.log(`  Factors:            Excess: ${riskVerdict.factors.discountExcess} | Margin: ${riskVerdict.factors.marginBreach} | Value: ${riskVerdict.factors.dealValue} | Violations: ${riskVerdict.factors.multipleViolations} | Tier: ${riskVerdict.factors.historicalBehavior}`);

  // 4. Select Approval Steps
  const approvalRouting = selectApprovalPolicySteps(fixture.policy, scoreVerdict);
  const triggeredRoles = approvalRouting.matchedSteps.map((s) => s.roleCode);

  console.log(`Routing Verdict:`);
  console.log(`  Requires Approval:  ${approvalRouting.requiresApproval}`);
  console.log(`  Triggered Roles:    ${triggeredRoles.join(', ') || 'None (Auto-approved)'}`);
  approvalRouting.matchedSteps.forEach((s) => {
    console.log(`    * Step ${s.stepOrder} [${s.roleName}]: ${s.triggerReasons.join('; ')}`);
  });

  // 4. Validate Against Expectations
  let passed = true;
  const checks = [];

  if (fixture.expected.worstLineOverage !== undefined) {
    const match = Math.abs(scoreVerdict.worstLineOverage - fixture.expected.worstLineOverage) < 0.05;
    checks.push(`Worst line overage (${scoreVerdict.worstLineOverage} vs expected ${fixture.expected.worstLineOverage}): ${match ? 'PASS' : 'FAIL'}`);
    if (!match) passed = false;
  }

  if (fixture.expected.blendedScore !== undefined) {
    const match = Math.abs(scoreVerdict.blendedScore - fixture.expected.blendedScore) < 0.05;
    checks.push(`Blended score (${scoreVerdict.blendedScore} vs expected ${fixture.expected.blendedScore}): ${match ? 'PASS' : 'FAIL'}`);
    if (!match) passed = false;
  }

  if (fixture.expected.requiresApproval !== undefined) {
    const match = approvalRouting.requiresApproval === fixture.expected.requiresApproval;
    checks.push(`Requires approval (${approvalRouting.requiresApproval} vs expected ${fixture.expected.requiresApproval}): ${match ? 'PASS' : 'FAIL'}`);
    if (!match) passed = false;
  }

  if (fixture.expected.triggeredRoleCodes !== undefined) {
    const expectedRoles = fixture.expected.triggeredRoleCodes.sort().join(',');
    const actualRoles = triggeredRoles.sort().join(',');
    const match = expectedRoles === actualRoles;
    checks.push(`Triggered roles ([${actualRoles}] vs expected [${expectedRoles}]): ${match ? 'PASS' : 'FAIL'}`);
    if (!match) passed = false;
  }

  if (fixture.expected.detectedEffectiveDiscount !== undefined) {
    const actualDiscount = resolvedLines[0]?.effectiveDiscountPercent;
    const match = Math.abs(actualDiscount - fixture.expected.detectedEffectiveDiscount) < 0.05;
    checks.push(`Anti-bypass discount (${actualDiscount}% vs expected ${fixture.expected.detectedEffectiveDiscount}%): ${match ? 'PASS' : 'FAIL'}`);
    if (!match) passed = false;
  }

  console.log(`Assertions:`);
  checks.forEach((c) => console.log(`  ✔ ${c}`));

  if (!passed) {
    console.error(`❌ FAILED: ${fixture.name}`);
    return false;
  }

  console.log(`✅ PASSED: ${fixture.name}`);
  return true;
}

function runAll() {
  console.log(`============================================================`);
  console.log(`DealFlow360 Pure Rules & Fixtures Verification`);
  console.log(`============================================================`);

  const fixtures = [
    FIXTURE_1_WORKED_EXAMPLE,
    FIXTURE_2_MANY_SMALL_VIOLATIONS,
    FIXTURE_3_CLEAN_QUOTE,
    FIXTURE_4_ANTI_BYPASS,
  ];

  let allPassed = true;
  for (const f of fixtures) {
    const ok = runFixtureTest(f);
    if (!ok) allPassed = false;
  }

  console.log(`\n============================================================`);
  if (allPassed) {
    console.log(`🎉 ALL 4 FIXTURES PASSED SUCCESSFULLY! Zero failures.`);
  } else {
    console.error(`💥 SOME FIXTURES FAILED.`);
    process.exit(1);
  }
  console.log(`============================================================\n`);
}

runAll();
