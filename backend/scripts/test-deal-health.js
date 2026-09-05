// backend/scripts/test-deal-health.js
// Verification script for Manager Stalled Quotations, Deal Health Dashboard, and Role Governance

const API_BASE = "http://localhost:4000/api";

const assert = (condition, message) => {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
};

async function login(email, password = "Password123!") {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || json.message || "Login failed");
  return json.data.accessToken;
}

async function main() {
  console.log("\n=================================================");
  console.log("  TESTING MANAGER STALLED DEALS & DEAL HEALTH   ");
  console.log("=================================================");

  const managerToken = await login("manager@dealflow360.com");
  const repToken = await login("rep@dealflow360.com");

  // ── 1. Deal Health & Stalled Deals Endpoint ───────────────────────
  console.log("\n1. Testing GET /api/quotations/deal-health (Sales Manager)...");
  const healthRes = await fetch(`${API_BASE}/quotations/deal-health`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(healthRes.ok, `GET /api/quotations/deal-health responded with 200 OK (Status: ${healthRes.status})`);
  
  const healthData = await healthRes.json();
  const summary = healthData.data?.summary;
  assert(summary !== undefined, "Summary metrics payload returned");
  assert(summary.stalledThresholdDays === 7, `Stalled threshold correctly reads governance setting (7 days)`);
  assert(summary.stalledCount >= 1, `Stalled count detected >= 1 (Found: ${summary.stalledCount})`);
  assert(summary.atRiskCount >= 1, `At-risk count detected >= 1 (Found: ${summary.atRiskCount})`);

  const stalledDeals = healthData.data?.stalledQuotations || [];
  const q5 = stalledDeals.find((q) => q.quotationNumber === "QTN-2026-005");
  assert(q5 !== undefined, "Seeded quotation QTN-2026-005 correctly detected as stalled");
  assert(q5.daysInactive >= 10, `Days inactive correctly calculated (${q5.daysInactive} days >= 10)`);
  assert(q5.signals.some((s) => s.signalType === "STALLED_DEAL"), "STALLED_DEAL signal attached to quotation");

  // ── 2. Filtered Stalled Quotations Query ──────────────────────────
  console.log("\n2. Testing GET /api/quotations?stalled=true...");
  const stalledQueryRes = await fetch(`${API_BASE}/quotations?stalled=true`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(stalledQueryRes.ok, "GET /api/quotations?stalled=true responded 200 OK");
  const stalledQueryData = await stalledQueryRes.json();
  const filteredQuotes = stalledQueryData.data?.quotations || [];
  assert(filteredQuotes.length >= 1, `Filtered stalled quotations returned (Found: ${filteredQuotes.length})`);
  assert(
    filteredQuotes.some((q) => q.quotationNumber === "QTN-2026-005"),
    "Filtered query isolates stalled quotation QTN-2026-005"
  );

  // ── 3. Sales Manager Role Governance on Tiers ────────────────────
  console.log("\n3. Testing Sales Manager permission to configure Customer Tiers...");
  const tiersRes = await fetch(`${API_BASE}/customer-tiers`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const tiersData = await tiersRes.json();
  const gold = tiersData.data.tiers.find((t) => t.code === "GOLD");
  
  const updateTierRes = await fetch(`${API_BASE}/customer-tiers/${gold.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({ maxDiscountPercent: 15.0 }),
  });
  assert(updateTierRes.ok, `Sales Manager can configure Customer Tiers (Status: ${updateTierRes.status})`);

  // ── 4. Sales Manager Role Governance on Approval Chains ──────────
  console.log("\n4. Testing Sales Manager permission to configure Approval Chains...");
  const policiesRes = await fetch(`${API_BASE}/approvals/policies`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const policiesData = await policiesRes.json();
  const policies = Array.isArray(policiesData) ? policiesData : policiesData.data;
  const activePolicy = policies.find((p) => p.isActive) || policies[0];
  const step = activePolicy.steps[0];

  const updateStepRes = await fetch(`${API_BASE}/approvals/policies/steps/${step.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({ minWorstLineOverage: 5.0, minBlendedScore: 2.0 }),
  });
  assert(updateStepRes.ok, `Sales Manager can configure Approval Ladder Steps (Status: ${updateStepRes.status})`);

  // ── 5. Sales Rep Role Boundaries (Negative Test) ─────────────────
  console.log("\n5. Testing Sales Rep role boundary (Must be denied configuring Tiers)...");
  const repTierRes = await fetch(`${API_BASE}/customer-tiers/${gold.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${repToken}` },
    body: JSON.stringify({ maxDiscountPercent: 20.0 }),
  });
  assert(repTierRes.status === 403, `Sales Rep is forbidden from configuring Customer Tiers (Status: ${repTierRes.status})`);

  console.log("\n=================================================");
  console.log("  ALL MANAGER & ROLE GOVERNANCE TESTS PASSED!    ");
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
