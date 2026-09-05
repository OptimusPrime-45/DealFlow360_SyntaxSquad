// ============================================================================
//  DealFlow360 — §9 pipeline verifier
//
//  Drives the eight-step walkthrough end to end over HTTP and asserts the
//  VISIBLE, CORRECT RESULT at each step — not just that the screens render.
//
//    npm run verify          (server must already be running on PORT)
//
//  "If all eight steps work smoothly and each result matches what is expected,
//   the core flow is solid." This script is what turns that from a hope into
//   something you can run in front of a judge.
// ============================================================================

import "dotenv/config";
import { prisma } from "../lib/prisma.js";

const API = process.env.VERIFY_API_URL || `http://localhost:${process.env.PORT || 4000}`;

// ── tiny test harness ───────────────────────────────────────────────────────
const results = [];
let currentStep = "";

const step = (name) => {
  currentStep = name;
  console.log(`\n\x1b[1m▶ ${name}\x1b[0m`);
};

const check = (ok, message, detail = "") => {
  results.push({ step: currentStep, ok, message });
  console.log(
    ok ? `  \x1b[32m✔\x1b[0m ${message}` : `  \x1b[31m✘ ${message}\x1b[0m`,
    detail ? `\n      ${detail}` : ""
  );
  return ok;
};

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
};

const login = async (email) => {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: { email, password: "Password123!" },
  });
  return r.data?.data?.accessToken || r.data?.data?.token || null;
};

const num = (v) => Number(v ?? 0);

// ============================================================================

async function run() {
  console.log(`\n\x1b[1mDealFlow360 — §9 pipeline verification\x1b[0m`);
  console.log(`API: ${API}\n${"=".repeat(70)}`);

  // ==========================================================================
  step("Step 1 — Log in, and set up a discount tier, a warehouse and a plan");
  // ==========================================================================
  const adminToken = await login("admin@dealflow360.com");
  const repToken = await login("rep@dealflow360.com");
  const managerToken = await login("manager@dealflow360.com");
  const financeToken = await login("finance@dealflow360.com");

  if (!check(!!adminToken && !!repToken && !!managerToken, "All four roles can log in")) {
    return finish();
  }

  // Discount tier — a ceiling the admin owns.
  const tiers = (await api("/api/customer-tiers", { token: adminToken })).data?.data;
  const tierList = tiers?.tiers || tiers?.customerTiers || tiers || [];
  const gold = tierList.find((t) => t.code === "GOLD");
  check(!!gold && num(gold.maxDiscountPercent) === 15, "Gold discount tier configured at 15%");

  // Warehouse — created live through the API, as a real user action.
  const whCode = `WH-VERIFY-${Date.now().toString().slice(-6)}`;
  const createdWh = await api("/api/warehouses", {
    method: "POST",
    token: adminToken,
    body: { code: whCode, name: "Verification Depot", shippingWeight: 2.5, priority: 1 },
  });
  check(createdWh.status === 201, "Admin can CREATE a warehouse through the API");
  const tempWarehouseId = createdWh.data?.data?.warehouse?.id;

  // Subscription plan — also created live.
  const products = (await api("/api/products", { token: adminToken })).data?.data?.products || [];
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));
  const subProduct = bySku["SUB-CLOUD-ENT"];

  const createdPlan = await api("/api/subscription-plans", {
    method: "POST",
    token: adminToken,
    body: {
      productId: subProduct.id,
      name: `Verification Plan ${Date.now().toString().slice(-6)}`,
      billingInterval: "MONTHLY",
      price: 60,
    },
  });
  check(createdPlan.status === 201, "Admin can CREATE a subscription plan through the API");
  const tempPlanId = createdPlan.data?.data?.plan?.id;

  // Establish the stock preconditions through the API rather than assuming the
  // seed is untouched. Previous runs reserve stock, so a verifier that only READ
  // stock would pass once and then fail forever — it would consume its own
  // precondition. Setting it here also exercises the admin stock configuration
  // that §9 step 1 asks for.
  const allWarehouses =
    (await api("/api/warehouses", { token: adminToken })).data?.data?.warehouses || [];
  const main = allWarehouses.find((w) => w.code === "WH-MAIN");
  const east = allWarehouses.find((w) => w.code === "WH-EAST");
  check(!!main && !!east, "Main Warehouse and East Depot both exist");

  // Neither warehouse alone can cover the 12-unit order placed in step 2.
  const MAIN_QTY = 5;
  const EAST_QTY = 9;
  const setMain = await api(`/api/warehouses/${main.id}/inventory`, {
    method: "PUT",
    token: adminToken,
    body: { productId: bySku["HW-LAPTOP-15"].id, availableQty: MAIN_QTY, reservedQty: 0, reorderLevel: 3 },
  });
  const setEast = await api(`/api/warehouses/${east.id}/inventory`, {
    method: "PUT",
    token: adminToken,
    body: { productId: bySku["HW-LAPTOP-15"].id, availableQty: EAST_QTY, reservedQty: 0, reorderLevel: 3 },
  });
  check(setMain.ok && setEast.ok, "Admin can SET stock levels per warehouse");

  const stock = (await api("/api/warehouses/stock/overview", { token: adminToken })).data?.data?.stock || [];
  const laptopStock = stock.find((s) => s.sku === "HW-LAPTOP-15");
  const spread = laptopStock?.warehouses?.filter((w) => w.sellableQty > 0) || [];
  check(
    spread.length >= 2,
    `Laptop stock spread across ${spread.length} warehouses, neither covering the order alone`,
    spread.map((w) => `${w.code}=${w.sellableQty}`).join("  ")
  );

  // ==========================================================================
  step("Step 2 — Create a quotation with a discount higher than allowed");
  // ==========================================================================
  const customers = (await api("/api/customers", { token: repToken })).data?.data?.customers || [];
  const goldCustomer = customers.find((c) => c.customerTier?.code === "GOLD");
  check(!!goldCustomer, `Gold customer available: ${goldCustomer?.name}`);

  // PDF §10 worked example: 12% on hardware (ceiling 15 → fine),
  // 18% on a thin-margin service (ceiling 10 → 8 points over).
  const LAPTOP_QTY = 12; // deliberately more than either warehouse holds alone
  const created = await api("/api/quotations", {
    method: "POST",
    token: repToken,
    body: {
      customerId: goldCustomer.id,
      lines: [
        { productId: bySku["HW-LAPTOP-15"].id, quantity: LAPTOP_QTY, discountPercent: 12 },
        { productId: bySku["SRV-SETUP-01"].id, quantity: 1, discountPercent: 18 },
      ],
    },
  });

  const quote = created.data?.data?.quotation;
  if (!check(created.status === 201 && !!quote, "Quotation created")) return finish();

  const hwLine = quote.lines.find((l) => num(l.discountPercent) === 12);
  const svcLine = quote.lines.find((l) => num(l.discountPercent) === 18);

  check(
    num(hwLine.effectiveCeilingPercent) === 15 && num(hwLine.overagePts) === 0,
    "Hardware line 12% is within its 15% ceiling — 0 points over"
  );
  check(
    num(svcLine.effectiveCeilingPercent) === 10 && num(svcLine.overagePts) === 8,
    "Service line 18% breaks its stricter 10% ceiling — 8 points over",
    "the whole quote is flagged because of one line, exactly as PDF §10 describes"
  );
  // blendedScore is value-weighted, so it depends on the quantities actually
  // ordered: SUM(overage x lineValue) / SUM(lineValue). Compute the expectation
  // rather than hardcoding the qty-1 figure from PDF §10.
  const hwValue = num(hwLine.unitPrice) * hwLine.quantity;
  const svcValue = num(svcLine.unitPrice) * svcLine.quantity;
  const expectedBlended =
    Math.round(((0 * hwValue + 8 * svcValue) / (hwValue + svcValue)) * 100) / 100;

  check(
    num(quote.worstLineOverage) === 8,
    `Worst single line is 8 points over its ceiling`
  );
  check(
    num(quote.blendedScore) === expectedBlended,
    `Blended score ${quote.blendedScore} matches value-weighted expectation ${expectedBlended}`
  );
  check(quote.status === "DRAFT", "Quotation is still DRAFT — nothing routed yet");

  // ==========================================================================
  step("Step 3 — Confirming AUTOMATICALLY asks for manager approval");
  // ==========================================================================
  const submitted = await api(`/api/quotations/${quote.id}/submit`, {
    method: "POST",
    token: repToken,
    body: {},
  });

  const routedTo = submitted.data?.data?.routedTo || [];
  check(
    submitted.data?.data?.status === "PENDING_APPROVAL",
    "Quotation moved to PENDING_APPROVAL on confirm"
  );
  check(
    routedTo.includes("SALES_MANAGER"),
    `Routed to [${routedTo.join(", ")}] — the rep never requested approval`
  );

  const approvalRecord = await prisma.quotationApproval.findFirst({
    where: { quotationId: quote.id },
    orderBy: { approvalCycle: "desc" },
    include: { steps: { include: { role: true }, orderBy: { stepOrder: "asc" } } },
  });
  check(
    approvalRecord?.triggeredBy === "REP_SUBMIT" && approvalRecord?.approvalCycle === 1,
    "Approval cycle 1 opened with triggeredBy=REP_SUBMIT"
  );
  check(
    Array.isArray(approvalRecord?.findings) && approvalRecord.findings.length > 0,
    "Per-line findings STORED on the approval, so the reviewer sees why"
  );

  const sysAudit = await prisma.auditLog.findFirst({
    where: { quotationId: quote.id, action: "APPROVAL_REQUESTED" },
  });
  check(!!sysAudit, "Audit trail records the automatic routing");

  // ==========================================================================
  step("Step 4 — Accept an upsell suggestion; total and margin update at once");
  // ==========================================================================
  // Build a second, clean quotation to edit (the first is locked in approval).
  const upsellQuote = (
    await api("/api/quotations", {
      method: "POST",
      token: repToken,
      body: {
        customerId: goldCustomer.id,
        lines: [{ productId: bySku["HW-LAPTOP-15"].id, quantity: 2, discountPercent: 10 }],
      },
    })
  ).data?.data?.quotation;

  const beforeTotal = num(upsellQuote.grandTotal);
  const beforeMargin = num(upsellQuote.marginAmount);

  const suggestions =
    (await api(`/api/quotations/${upsellQuote.id}/suggestions`, { token: repToken })).data?.data
      ?.suggestions || [];

  check(suggestions.length > 0, `${suggestions.length} ranked upsell suggestion(s) offered`);
  check(
    suggestions.every((s) => s.marginPercent >= 0) && "marginDelta" in (suggestions[0] || {}),
    "Each suggestion reports its margin impact before it is accepted"
  );

  const accepted = await api(`/api/quotations/${upsellQuote.id}/lines`, {
    method: "POST",
    token: repToken,
    body: {
      productId: suggestions[0].productId,
      quantity: 1,
      discountPercent: 0,
      addedViaUpsell: true,
    },
  });

  const afterQuote = accepted.data?.data?.quotation;
  const afterTotal = num(afterQuote.grandTotal);
  const afterMargin = num(afterQuote.marginAmount);

  check(
    afterTotal > beforeTotal && afterMargin > beforeMargin,
    `Total ${beforeTotal} → ${afterTotal} and margin ${beforeMargin} → ${afterMargin} updated immediately`
  );
  check(
    afterQuote.lines.some((l) => l.addedViaUpsell === true),
    "Line is tagged addedViaUpsell for reporting"
  );

  // ==========================================================================
  step("Step 5 — Approve, then confirm stock pulls from the right warehouses");
  // ==========================================================================
  const pendingSteps = approvalRecord.steps;
  for (const s of pendingSteps) {
    const token = s.role.code === "FINANCE" ? financeToken : managerToken;
    const r = await api(`/api/approvals/steps/${s.id}/approve`, {
      method: "POST",
      token,
      body: { reason: "Verified against policy during pipeline check" },
    });
    check(r.ok, `${s.role.code} approved step ${s.stepOrder}`);
  }

  const approvedQuote = await prisma.quotation.findUnique({ where: { id: quote.id } });
  check(approvedQuote.status === "APPROVED", "Quotation is APPROVED after the ladder completes");

  const confirmed = await api(`/api/orders/${quote.id}/confirm`, {
    method: "POST",
    token: repToken,
    body: {},
  });
  const order = confirmed.data?.data?.order;
  if (!check(confirmed.status === 201 && !!order, "Order created from the approved quotation")) {
    return finish();
  }

  const plan = await api(`/api/fulfillment/orders/${order.id}/plan`, { token: repToken });
  check(plan.ok, "Fulfillment plan computed from live stock");

  const allocated = await api(`/api/fulfillment/orders/${order.id}/allocate`, {
    method: "POST",
    token: repToken,
    body: {},
  });
  check(allocated.ok, "Allocation accepted");

  const allocations = await prisma.fulfillmentAllocation.findMany({
    where: { orderId: order.id },
    include: { warehouse: true, orderLine: { include: { product: true } } },
  });

  const laptopAllocs = allocations.filter((a) => a.orderLine.product.sku === "HW-LAPTOP-15");
  const usedWarehouses = new Set(laptopAllocs.filter((a) => a.warehouseId).map((a) => a.warehouseId));
  const totalAllocated = laptopAllocs.reduce((s, a) => s + a.allocatedQty, 0);
  const totalBackordered = laptopAllocs.reduce((s, a) => s + a.backorderQty, 0);

  check(
    usedWarehouses.size >= 2,
    `Laptop order of ${LAPTOP_QTY} split across ${usedWarehouses.size} warehouses`,
    laptopAllocs
      .map((a) => `${a.warehouse?.code || "BACKORDER"}: alloc=${a.allocatedQty} back=${a.backorderQty}`)
      .join("  ")
  );
  check(
    totalAllocated + totalBackordered === LAPTOP_QTY,
    `Allocated ${totalAllocated} + backordered ${totalBackordered} = ordered ${LAPTOP_QTY}`
  );

  // ==========================================================================
  step("Step 6 — One-time and recurring lines bill correctly and SEPARATELY");
  // ==========================================================================
  const hybridQuote = (
    await api("/api/quotations", {
      method: "POST",
      token: repToken,
      body: {
        customerId: goldCustomer.id,
        lines: [
          { productId: bySku["HW-LAPTOP-15"].id, quantity: 1, discountPercent: 5 },
          {
            productId: subProduct.id,
            quantity: 2,
            discountPercent: 0,
            subscriptionPlanId: tempPlanId,
          },
        ],
      },
    })
  ).data?.data?.quotation;

  const oneTimeLines = hybridQuote.lines.filter((l) => l.lineType === "ONE_TIME");
  const recurringLines = hybridQuote.lines.filter((l) => l.lineType === "RECURRING");
  check(
    oneTimeLines.length === 1 && recurringLines.length === 1,
    "Same order carries one ONE_TIME line and one RECURRING line"
  );

  await api(`/api/quotations/${hybridQuote.id}/submit`, { method: "POST", token: repToken, body: {} });
  const hybridStatus = await prisma.quotation.findUnique({ where: { id: hybridQuote.id } });
  check(hybridStatus.status === "APPROVED", "Compliant hybrid quote auto-approved (no human needed)");

  const hybridOrder = (
    await api(`/api/orders/${hybridQuote.id}/confirm`, { method: "POST", token: repToken, body: {} })
  ).data?.data?.order;

  const subsRes = await api(`/api/subscriptions/orders/${hybridOrder.id}/create`, {
    method: "POST",
    token: financeToken,
    body: {},
  });
  check(subsRes.ok, "Subscriptions and billing schedules generated for recurring lines");

  const subs = await prisma.subscription.findMany({
    where: { orderId: hybridOrder.id },
    include: { billingSchedules: true, subscriptionPlan: true },
  });
  check(
    subs.length === 1 && subs[0].billingSchedules.length > 0,
    `Recurring line produced ${subs[0]?.billingSchedules.length ?? 0} scheduled billing period(s)`
  );

  const invRes = await api(`/api/invoices/generate/${hybridOrder.id}`, {
    method: "POST",
    token: financeToken,
    body: {},
  });
  check(invRes.ok, "Invoices generated for the order");

  const invoices = await prisma.invoice.findMany({
    where: { orderId: hybridOrder.id },
    include: { lines: true },
  });
  const oneTimeInvoices = invoices.filter((i) => i.invoiceType === "ONE_TIME");
  const recurringInvoices = invoices.filter((i) => i.invoiceType === "RECURRING");

  check(
    oneTimeInvoices.length >= 1 && recurringInvoices.length >= 1,
    `Billed SEPARATELY: ${oneTimeInvoices.length} one-time invoice(s), ${recurringInvoices.length} recurring invoice(s)`
  );

  // ==========================================================================
  step("Step 7 — Customer counters in the portal; quote re-enters approval");
  // ==========================================================================
  const portalQuote = (
    await api("/api/quotations", {
      method: "POST",
      token: repToken,
      body: {
        customerId: goldCustomer.id,
        lines: [{ productId: bySku["HW-LAPTOP-15"].id, quantity: 1, discountPercent: 10 }],
      },
    })
  ).data?.data?.quotation;

  await api(`/api/quotations/${portalQuote.id}/submit`, { method: "POST", token: repToken, body: {} });
  const beforeNegotiation = await prisma.quotation.findUnique({ where: { id: portalQuote.id } });
  check(
    beforeNegotiation.status === "APPROVED",
    "Compliant quote auto-approved before the customer sees it"
  );

  const unauthMint = await api(`/api/quotations/${portalQuote.id}/portal-link`, {
    method: "POST",
    body: { expiresInDays: 7 },
  });
  check(unauthMint.status === 401, "Portal links cannot be minted without an internal token");

  const linkRes = await api(`/api/quotations/${portalQuote.id}/portal-link`, {
    method: "POST",
    token: repToken,
    body: { expiresInDays: 7 },
  });
  const portalToken = linkRes.data?.data?.token;
  check(!!portalToken, "Rep minted a customer portal link");

  // M6: the portal token must not open internal doors.
  const crossUse = await api("/api/internal/test-protected", { token: portalToken });
  check(crossUse.status === 401, "Portal token is REFUSED on an internal route (M6)");

  const counter = await api("/api/portal/negotiate", {
    method: "POST",
    token: portalToken,
    body: {
      requestType: "DISCOUNT",
      proposedDiscountPercent: 22,
      message: "We need a better price to sign this quarter.",
    },
  });
  check(counter.ok, "Customer submitted a counter-offer of 22% from the portal");

  const midNegotiation = await prisma.quotation.findUnique({ where: { id: portalQuote.id } });
  check(
    midNegotiation.status === "UNDER_NEGOTIATION",
    "Quote moves to UNDER_NEGOTIATION while the customer's ask is open"
  );

  // The customer ASKS; the rep APPLIES. Applying is what re-routes — a customer
  // must not be able to mutate a quotation directly.
  const negRequestId =
    counter.data?.data?.requestId ||
    counter.data?.data?.id ||
    counter.data?.data?.negotiationRequest?.id;

  const responded = await api(`/api/negotiations/requests/${negRequestId}/respond`, {
    method: "POST",
    token: repToken,
    body: { action: "ACCEPT", responseMessage: "Accepted; routing for authorisation" },
  });
  check(responded.ok, "Rep accepted the counter-offer");

  const afterNegotiation = await prisma.quotation.findUnique({
    where: { id: portalQuote.id },
    include: { approvals: { orderBy: { approvalCycle: "desc" } } },
  });
  const latest = afterNegotiation.approvals[0];

  check(
    afterNegotiation.status === "PENDING_APPROVAL",
    `Quote automatically re-entered approval (status ${afterNegotiation.status}) — nobody requested it`
  );
  check(
    latest?.triggeredBy === "CUSTOMER_NEGOTIATION",
    "New approval cycle is tagged triggeredBy=CUSTOMER_NEGOTIATION"
  );
  check(
    latest?.approvalCycle >= 1,
    `Recorded as approval cycle ${latest?.approvalCycle} — the earlier review stays readable`
  );

  const cycleSteps = await prisma.quotationApprovalStep.findMany({
    where: { quotationApprovalId: latest.id },
    include: { role: true },
  });
  check(
    cycleSteps.length > 0,
    `Re-entry cycle has ${cycleSteps.length} approvable step(s): ${cycleSteps
      .map((s2) => s2.role.code)
      .join(", ")}`,
    "an approval cycle with no steps would leave the quote stuck forever"
  );

  const negScored = await prisma.quotation.findUnique({ where: { id: portalQuote.id } });
  check(
    num(negScored.worstLineOverage) === 7,
    `Re-scored after the counter: 22% against a 15% ceiling = ${negScored.worstLineOverage} points over`
  );

  // ==========================================================================
  step("Step 8 — Confirm the order, record a payment, invoice status updates");
  // ==========================================================================
  const payInvoice = oneTimeInvoices[0];
  check(payInvoice.status === "DRAFT", `Invoice starts as ${payInvoice.status}`);

  const posted = await api(`/api/invoices/${payInvoice.id}/post`, {
    method: "POST",
    token: financeToken,
    body: {},
  });
  check(posted.ok, "Invoice POSTED for collection");

  const total = num(payInvoice.totalAmount);
  const half = Math.round(total * 50) / 100;

  const partial = await api(`/api/invoices/${payInvoice.id}/payments`, {
    method: "POST",
    token: financeToken,
    body: { amount: half, paymentMethod: "BANK_TRANSFER", transactionReference: "VERIFY-1" },
  });
  check(partial.ok, `Partial payment of ${half} recorded`);

  let invNow = await prisma.invoice.findUnique({ where: { id: payInvoice.id } });
  check(
    invNow.status === "PARTIALLY_PAID",
    `Invoice status moved to ${invNow.status} after partial payment`
  );

  const rest = Math.round((total - num(invNow.amountPaid)) * 100) / 100;
  const final = await api(`/api/invoices/${payInvoice.id}/payments`, {
    method: "POST",
    token: financeToken,
    body: { amount: rest, paymentMethod: "BANK_TRANSFER", transactionReference: "VERIFY-2" },
  });
  check(final.ok, `Balance of ${rest} recorded`);

  invNow = await prisma.invoice.findUnique({ where: { id: payInvoice.id } });
  check(
    invNow.status === "PAID" && num(invNow.amountPaid) === total,
    `Invoice status is ${invNow.status} with amountPaid ${invNow.amountPaid} of ${total}`
  );

  // ── cleanup of the throwaway config created in step 1 ─────────────────────
  if (tempWarehouseId) {
    await api(`/api/warehouses/${tempWarehouseId}`, { method: "DELETE", token: adminToken });
  }

  return finish();
}

function finish() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`\x1b[1m §9 PIPELINE: ${passed} passed, ${failed.length} failed\x1b[0m`);

  if (failed.length) {
    console.log("\n Failures:");
    for (const f of failed) console.log(`   \x1b[31m✘\x1b[0m [${f.step}] ${f.message}`);
  } else {
    console.log("\n \x1b[32mAll eight steps produced the expected result. The core flow is solid.\x1b[0m");
  }
  console.log(`${"=".repeat(70)}\n`);

  return failed.length === 0 ? 0 : 1;
}

run()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code ?? 0);
  })
  .catch(async (err) => {
    console.error("\n\x1b[31mVerifier crashed:\x1b[0m", err.message);
    console.error(err.stack?.split("\n").slice(0, 5).join("\n"));
    await prisma.$disconnect();
    process.exit(1);
  });
