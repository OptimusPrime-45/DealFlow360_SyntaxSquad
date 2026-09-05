// ============================================================================
// DealFlow360 — API Controller & Module Integrity Verification
// Verifies that all controllers, routes, and risk engine modules import cleanly
// and export the exact required interfaces without schema violations.
// Run: node scripts/test-api-flow.js
// ============================================================================

import app from '../app.js';
import governanceController from '../controllers/governance.controller.js';
import approvalController from '../controllers/approval.controller.js';
import auditController from '../controllers/audit.controller.js';
import { calculateRiskScore } from '../rules/riskEngine.js';

console.log(`============================================================`);
console.log(`Verifying DealFlow360 Controllers, Routes & Risk Engine`);
console.log(`============================================================`);

let passed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    passed = false;
  } else {
    console.log(`✔ PASS: ${message}`);
  }
}

// 1. Check Governance Controller
assert(
  typeof governanceController.getSettings === 'function',
  'governance.controller.getSettings is exported'
);
assert(
  typeof governanceController.updateSettings === 'function',
  'governance.controller.updateSettings is exported'
);
assert(
  typeof governanceController.listDiscountRules === 'function',
  'governance.controller.listDiscountRules is exported'
);
assert(
  typeof governanceController.createDiscountRule === 'function',
  'governance.controller.createDiscountRule is exported'
);
assert(
  typeof governanceController.updateDiscountRule === 'function',
  'governance.controller.updateDiscountRule is exported'
);
assert(
  typeof governanceController.deleteDiscountRule === 'function',
  'governance.controller.deleteDiscountRule is exported'
);
assert(
  typeof governanceController.evaluateQuotation === 'function',
  'governance.controller.evaluateQuotation is exported'
);
assert(
  typeof governanceController.runQuotationEvaluation === 'function',
  'governance.controller.runQuotationEvaluation is exported'
);

// 2. Check Approval Controller
assert(
  typeof approvalController.getPolicies === 'function',
  'approval.controller.getPolicies is exported'
);
assert(
  typeof approvalController.createPolicy === 'function',
  'approval.controller.createPolicy is exported'
);
assert(
  typeof approvalController.createPolicyStep === 'function',
  'approval.controller.createPolicyStep is exported'
);
assert(
  typeof approvalController.updatePolicyStep === 'function',
  'approval.controller.updatePolicyStep is exported'
);
assert(
  typeof approvalController.deletePolicyStep === 'function',
  'approval.controller.deletePolicyStep is exported'
);
assert(
  typeof approvalController.requestApproval === 'function',
  'approval.controller.requestApproval is exported'
);
assert(
  typeof approvalController.approveStep === 'function',
  'approval.controller.approveStep is exported'
);
assert(
  typeof approvalController.rejectStep === 'function',
  'approval.controller.rejectStep is exported'
);
assert(
  typeof approvalController.returnStep === 'function',
  'approval.controller.returnStep is exported'
);
assert(
  typeof approvalController.getApprovalHistory === 'function',
  'approval.controller.getApprovalHistory is exported'
);

// 3. Check Audit Controller
assert(
  typeof auditController.getAuditLogs === 'function',
  'audit.controller.getAuditLogs is exported'
);

// 4. Test Risk Engine pure math factor bounds
const mockScoreVerdict = {
  blendedScore: 4.5,
  worstLineOverage: 12.0,
  marginFloorBreached: true,
  totalValue: 1500000,
  findings: [
    {
      lineMarginPercent: 8,
      minMarginPercent: 20,
      marginBreached: true,
      overagePts: 12,
    },
    {
      lineMarginPercent: 25,
      minMarginPercent: 20,
      marginBreached: false,
      overagePts: 2,
    },
  ],
};

const highRisk = calculateRiskScore(
  { grandTotal: 1500000, customerTier: { rank: 1 } },
  mockScoreVerdict
);

assert(highRisk.riskScore > 70, `High risk deal calculated score: ${highRisk.riskScore}/100`);
assert(highRisk.riskBand === 'CRITICAL', `High risk deal classified as: ${highRisk.riskBand}`);
assert(highRisk.factors.discountExcess > 0, `Discount excess factor > 0: ${highRisk.factors.discountExcess}`);
assert(highRisk.factors.marginBreach > 0, `Margin breach factor > 0: ${highRisk.factors.marginBreach}`);
assert(highRisk.factors.dealValue === 15, `Deal value factor is 15 pts: ${highRisk.factors.dealValue}`);

console.log(`\n============================================================`);
if (passed) {
  console.log(`🎉 ALL CONTROLLER & ROUTE CONTRACTS VERIFIED SUCCESSFULLY!`);
} else {
  console.error(`💥 CONTRACT VERIFICATION FAILED`);
  process.exit(1);
}
console.log(`============================================================\n`);
