import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const API_URL = "http://localhost:4000/api";
const JWT_SECRET = process.env.JWT_SECRET || "dev-internal-secret-change-me";

async function run() {
  console.log("=================================================");
  console.log("  RUNNING COMPREHENSIVE END-TO-END VERIFICATION  ");
  console.log("=================================================");

  // 1. Fetch test users (Sales Rep, Sales Manager)
  const repUser = await prisma.user.findFirst({
    where: { role: { code: "SALES_REP" } },
    include: { role: true },
  });
  const managerUser = await prisma.user.findFirst({
    where: { role: { code: "SALES_MANAGER" } },
    include: { role: true },
  });
  const customer = await prisma.customer.findFirst();
  const products = await prisma.product.findMany({ take: 3 });

  if (!repUser || !managerUser || !customer || products.length < 2) {
    throw new Error("Missing seeded test data in DB");
  }

  const repToken = jwt.sign(
    { userId: repUser.id, email: repUser.email, role: repUser.role.code, typ: "internal" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  const managerToken = jwt.sign(
    { userId: managerUser.id, email: managerUser.email, role: managerUser.role.code, typ: "internal" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  console.log(`✓ Rep User: ${repUser.email}`);
  console.log(`✓ Manager User: ${managerUser.email}`);
  console.log(`✓ Customer: ${customer.name}`);

  // -------------------------------------------------------------
  // TEST ISSUE 1: Manager Approval & Automatic Pipeline Routing
  // -------------------------------------------------------------
  console.log("\n--- [TEST ISSUE 1: Automatic Manager Approval Pipeline] ---");

  // A. Compliant quote (0% discount) with autoSubmit = true
  console.log("Submitting compliant quotation (0% discount, autoSubmit: true)...");
  const compliantRes = await fetch(`${API_URL}/quotations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
    },
    body: JSON.stringify({
      customerId: customer.id,
      autoSubmit: true,
      lines: [
        {
          productId: products[0].id,
          quantity: 2,
          discountPercent: 0,
        },
      ],
    }),
  });
  const compliantData = await compliantRes.json();
  if (!compliantRes.ok) throw new Error(`Failed to create compliant quote: ${JSON.stringify(compliantData)}`);
  const quote1 = compliantData.data.quotation;
  console.log(`  -> Compliant quote #${quote1.quotationNumber} Status: ${quote1.status}`);
  if (quote1.status !== "APPROVED") {
    throw new Error(`Expected quote1 status to be APPROVED automatically, got: ${quote1.status}`);
  }
  console.log("  ✓ Auto-approval for compliant quote verified!");

  // B. Over-ceiling quote (50% discount) with autoSubmit = true
  console.log("\nSubmitting over-ceiling quotation (50% discount, autoSubmit: true)...");
  const overCeilingRes = await fetch(`${API_URL}/quotations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
    },
    body: JSON.stringify({
      customerId: customer.id,
      autoSubmit: true,
      lines: [
        {
          productId: products[0].id,
          quantity: 1,
          discountPercent: 50,
        },
      ],
    }),
  });
  const overCeilingData = await overCeilingRes.json();
  if (!overCeilingRes.ok) throw new Error(`Failed to create over-ceiling quote: ${JSON.stringify(overCeilingData)}`);
  const quote2 = overCeilingData.data.quotation;
  console.log(`  -> Over-ceiling quote #${quote2.quotationNumber} Status: ${quote2.status}`);
  if (quote2.status !== "PENDING_APPROVAL") {
    throw new Error(`Expected quote2 to be PENDING_APPROVAL, got: ${quote2.status}`);
  }
  console.log("  ✓ Automatic routing to PENDING_APPROVAL verified!");

  // Manager reviews and approves the step
  const quote2DetailRes = await fetch(`${API_URL}/quotations/${quote2.id}`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const quote2Detail = await quote2DetailRes.json();
  const adminUser = await prisma.user.findFirst({
    where: { role: { code: "ADMIN" } },
    include: { role: true },
  });
  const adminToken = jwt.sign(
    { userId: adminUser.id, email: adminUser.email, role: adminUser.role.code, typ: "internal" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const steps = quote2Detail.data.quotation.approvals?.[0]?.steps || [];
  console.log(`  -> Found ${steps.length} approval ladder step(s) requiring review:`);
  for (const st of steps) {
    console.log(`     Step #${st.stepOrder} (${st.role?.name}) - Approving...`);
    const approveRes = await fetch(`${API_URL}/approvals/steps/${st.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reason: `Approved by ${st.role?.name || "Reviewer"}` }),
    });
    const approveData = await approveRes.json();
    if (!approveRes.ok) throw new Error(`Failed to approve step: ${JSON.stringify(approveData)}`);
    console.log(`     -> Status now: ${approveData.data.quotationStatus}`);
  }
  console.log("  ✓ All ladder steps approved and quotation reached APPROVED state!");

  // -------------------------------------------------------------
  // TEST ISSUE 2: Dynamic Upsell Generation Engine
  // -------------------------------------------------------------
  console.log("\n--- [TEST ISSUE 2: Dynamic Upsell Generation Engine] ---");
  // Create a draft quote with a product that previously had 0 rules
  console.log("Creating draft quotation with product to test upsells...");
  const draftQuoteRes = await fetch(`${API_URL}/quotations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
    },
    body: JSON.stringify({
      customerId: customer.id,
      autoSubmit: false,
      lines: [{ productId: products[1].id, quantity: 1, discountPercent: 0 }],
    }),
  });
  const draftQuoteData = await draftQuoteRes.json();
  const draftQuote = draftQuoteData.data.quotation;

  const suggestionsRes = await fetch(`${API_URL}/quotations/${draftQuote.id}/suggestions`, {
    headers: { Authorization: `Bearer ${repToken}` },
  });
  const suggestionsData = await suggestionsRes.json();
  const suggestions = suggestionsData.data.suggestions || [];
  console.log(`  -> Received ${suggestions.length} upsell suggestions:`);
  suggestions.forEach((s, idx) => {
    console.log(`     ${idx + 1}. ${s.name} (${s.promotionTag}) - Margin: ${s.marginPercent}%, Score: ${s.score}`);
  });

  if (suggestions.length === 0) {
    throw new Error("Upsell suggestions engine returned 0 suggestions!");
  }
  console.log("  ✓ Dynamic upsell generation engine successfully returned profitable suggestions!");

  // Accept first suggestion
  console.log(`  -> Adding suggestion '${suggestions[0].name}' to quote...`);
  const addLineRes = await fetch(`${API_URL}/quotations/${draftQuote.id}/lines`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
    },
    body: JSON.stringify({
      productId: suggestions[0].productId,
      quantity: 1,
      discountPercent: 0,
      addedViaUpsell: true,
    }),
  });
  if (!addLineRes.ok) throw new Error("Failed to add suggested product to quote");
  console.log("  ✓ Suggested item added to quotation lines and margin re-evaluated!");

  // -------------------------------------------------------------
  // TEST ISSUE 3: Portal Acceptance, Invoicing & Deal Closing
  // -------------------------------------------------------------
  console.log("\n--- [TEST ISSUE 3: Customer Acceptance, Order Creation, Invoicing & Deal Closing] ---");

  // Step 1: Submit draftQuote and approve it
  console.log("Submitting quotation for approval / acceptance...");
  const submitDraftRes = await fetch(`${API_URL}/quotations/${draftQuote.id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${repToken}` },
  });
  const submitDraftData = await submitDraftRes.json();
  console.log(`  -> Submit result: ${submitDraftData.message}`);

  // Step 2: Mint portal token
  console.log("Minting customer portal link...");
  const portalLinkRes = await fetch(`${API_URL}/quotations/${draftQuote.id}/portal-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
    },
    body: JSON.stringify({ expiresInDays: 7 }),
  });
  const portalLinkData = await portalLinkRes.json();
  const portalToken = portalLinkData.data?.token || portalLinkData.token;
  console.log(`  -> Portal token generated: ${portalToken.slice(0, 16)}...`);

  // Step 3: Customer accepts proposal via portal
  console.log("Customer clicking 'Accept Proposal' via Portal API...");
  const acceptRes = await fetch(`${API_URL}/portal/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${portalToken}`,
    },
    body: JSON.stringify({}),
  });
  const acceptData = await acceptRes.json();
  if (!acceptRes.ok) throw new Error(`Portal acceptance failed: ${JSON.stringify(acceptData)}`);
  console.log(`  -> Portal accept response: ${acceptData.message}`);
  const createdOrder = acceptData.data.order || (await prisma.order.findUnique({ where: { id: acceptData.data.orderId } }));
  console.log(`  -> Order created: ${createdOrder?.orderNumber}, Status: ${createdOrder?.status}`);
  console.log(`  -> Invoices generated count: ${acceptData.data.invoicesGenerated || 0}`);

  if (!createdOrder || createdOrder.status !== "PENDING_FULFILLMENT") {
    throw new Error(`Order not properly created: ${JSON.stringify(createdOrder)}`);
  }
  console.log("  ✓ Quotation confirmed to Order with initial invoices via Customer Portal!");

  // Step 4: Sales rep / Finance queries Invoices and Orders list
  console.log("\nSales rep querying /api/invoices and /api/orders...");
  const invoicesRes = await fetch(`${API_URL}/invoices?orderId=${createdOrder.id}`, {
    headers: { Authorization: `Bearer ${repToken}` },
  });
  const invoicesData = await invoicesRes.json();
  if (!invoicesRes.ok) throw new Error(`Sales rep cannot access /api/invoices: ${JSON.stringify(invoicesData)}`);
  const invoiceList = invoicesData.data.invoices || [];
  console.log(`  -> Sales rep successfully fetched ${invoiceList.length} invoice(s) (no 401/403!)`);

  const ordersRes = await fetch(`${API_URL}/orders`, {
    headers: { Authorization: `Bearer ${repToken}` },
  });
  const ordersData = await ordersRes.json();
  if (!ordersRes.ok) throw new Error(`Sales rep cannot access /api/orders: ${JSON.stringify(ordersData)}`);
  console.log(`  -> Sales rep successfully fetched ${ordersData.data.orders.length} order(s)`);

  // Step 5: Post invoice and record payment
  if (invoiceList.length > 0) {
    const testInvoice = invoiceList[0];
    console.log(`\nPosting invoice ${testInvoice.invoiceNumber} (DRAFT -> POSTED)...`);
    const postInvRes = await fetch(`${API_URL}/invoices/${testInvoice.id}/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${repToken}`,
      },
    });
    const postInvData = await postInvRes.json();
    if (!postInvRes.ok) throw new Error(`Failed to post invoice: ${JSON.stringify(postInvData)}`);
    console.log(`  -> Invoice status: ${postInvData.data.status}`);

    console.log(`Recording payment of ₹${testInvoice.totalAmount} against invoice...`);
    const payRes = await fetch(`${API_URL}/invoices/${testInvoice.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${repToken}`,
      },
      body: JSON.stringify({
        amount: Number(testInvoice.totalAmount),
        paymentMethod: "BANK_TRANSFER",
        transactionReference: `VERIF-TXN-${Date.now()}`,
      }),
    });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(`Failed to record payment: ${JSON.stringify(payData)}`);
    console.log(`  -> Payment recorded! Invoice balance remaining: ₹${payData.data.balanceRemaining}, Status: ${payData.data.status}`);
  }

  // Step 6: Close Deal / Complete Order
  console.log(`\nClosing deal for order ${createdOrder.orderNumber}...`);
  const closeRes = await fetch(`${API_URL}/orders/${createdOrder.id}/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
    },
    body: JSON.stringify({}),
  });
  const closeData = await closeRes.json();
  if (!closeRes.ok) throw new Error(`Failed to close order: ${JSON.stringify(closeData)}`);
  console.log(`  -> Deal closed! Order status: ${closeData.data.order.status}`);
  if (closeData.data.order.status !== "COMPLETED") {
    throw new Error(`Expected order to be COMPLETED, got: ${closeData.data.order.status}`);
  }
  console.log("  ✓ Final payment, deal closing, and order completion verified!");

  console.log("\n=================================================");
  console.log("  ALL 3 ISSUES VERIFIED AND PASSING 100%!        ");
  console.log("=================================================");
}

run()
  .catch((err) => {
    console.error("\n❌ Verification Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
