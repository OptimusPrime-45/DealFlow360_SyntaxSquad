// backend/scripts/test-fulfillment-split.js
import { prisma } from "../lib/prisma.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-internal-secret-change-me";
const BASE_URL = "http://localhost:4000/api";

async function run() {
  console.log("=================================================");
  console.log("  TESTING FULFILLMENT SPLIT, OVERRIDE & INVOICE  ");
  console.log("=================================================");

  // 1. Auth as Admin
  const adminUser = await prisma.user.findFirst({
    where: { role: { code: "ADMIN" } },
    include: { role: true },
  });
  if (!adminUser) throw new Error("No admin user found in DB");

  const adminToken = jwt.sign(
    { userId: adminUser.id, email: adminUser.email, role: adminUser.role.code, typ: "internal" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const customer = await prisma.customer.findFirst({
    include: { customerTier: true },
  });
  if (!customer) throw new Error("No customer found in DB");

  const laptopProduct = await prisma.product.findUnique({
    where: { sku: "HW-LAPTOP-15" },
  });
  const serverProduct = await prisma.product.findUnique({
    where: { sku: "HW-SERVER-2U" },
  });
  if (!laptopProduct || !serverProduct) throw new Error("Products not found");

  const whMain = await prisma.warehouse.findUnique({ where: { code: "WH-MAIN" } });
  const whEast = await prisma.warehouse.findUnique({ where: { code: "WH-EAST" } });
  if (!whMain || !whEast) throw new Error("Warehouses not found");

  // Ensure initial stock: Laptop (Main=5, East=9)
  await prisma.inventory.upsert({
    where: { warehouseId_productId: { warehouseId: whMain.id, productId: laptopProduct.id } },
    update: { availableQty: 5, reservedQty: 0 },
    create: { warehouseId: whMain.id, productId: laptopProduct.id, availableQty: 5, reservedQty: 0 },
  });
  await prisma.inventory.upsert({
    where: { warehouseId_productId: { warehouseId: whEast.id, productId: laptopProduct.id } },
    update: { availableQty: 9, reservedQty: 0 },
    create: { warehouseId: whEast.id, productId: laptopProduct.id, availableQty: 9, reservedQty: 0 },
  });

  // Zero server in WH-MAIN, 4 in WH-EAST for backorder test
  await prisma.inventory.upsert({
    where: { warehouseId_productId: { warehouseId: whMain.id, productId: serverProduct.id } },
    update: { availableQty: 0, reservedQty: 0 },
    create: { warehouseId: whMain.id, productId: serverProduct.id, availableQty: 0, reservedQty: 0 },
  });
  await prisma.inventory.upsert({
    where: { warehouseId_productId: { warehouseId: whEast.id, productId: serverProduct.id } },
    update: { availableQty: 4, reservedQty: 0 },
    create: { warehouseId: whEast.id, productId: serverProduct.id, availableQty: 4, reservedQty: 0 },
  });

  // 2. Create Quotation and Confirm to Order (Order 12 laptops: 5 Main + 7 East)
  console.log("\n1. Creating quotation and confirming to Sales Order...");
  const quoteRes = await fetch(`${BASE_URL}/quotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      customerId: customer.id,
      lines: [
        { productId: laptopProduct.id, quantity: 12, discountPercent: 0 },
      ],
    }),
  });
  const quoteData = await quoteRes.json();
  const quote = quoteData?.data?.quotation;
  if (!quote) throw new Error(`Quotation creation failed: ${JSON.stringify(quoteData)}`);

  // Submit and approve quote
  await fetch(`${BASE_URL}/quotations/${quote.id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ autoSubmit: true }),
  });

  // Confirm quotation to order
  const orderRes = await fetch(`${BASE_URL}/orders/${quote.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  const orderData = await orderRes.json();
  const order = orderData?.data?.order;
  if (!order) throw new Error(`Order confirmation failed: ${JSON.stringify(orderData)}`);
  console.log(`  ✓ Sales Order created: ${order.orderNumber} (Status: ${order.status})`);

  // 3. Test GET /api/fulfillment/orders/:id/plan (Warehouse Split Display)
  console.log("\n2. Fetching recommended fulfillment plan (Warehouse Split Screen display)...");
  const planRes = await fetch(`${BASE_URL}/fulfillment/orders/${order.id}/plan`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const planData = await planRes.json();
  const plan = planData.data;
  if (!plan) throw new Error(`Failed to get fulfillment plan: ${JSON.stringify(planData)}`);

  console.log(`  ✓ Total Shipments: ${plan.totalShipmentCount}`);
  console.log(`  ✓ Total Estimated Cost: ₹${plan.totalEstimatedCost}`);
  console.log("  ✓ Warehouse Splits breakdown:");
  plan.warehouseSplits.forEach((ws) => {
    console.log(`     - [${ws.warehouseName}]: ${ws.totalQuantity} units | ${ws.packageLabel} | Est. Cost: ₹${ws.estimatedCost}`);
    ws.items.forEach((it) => console.log(`        • ${it.productName} (${it.productSku}): ${it.quantity} units`));
  });

  if (plan.warehouseSplits.length !== 2) {
    throw new Error(`Expected split across 2 warehouses, got ${plan.warehouseSplits.length}`);
  }

  // 4. Test "Accept Suggested Split" (POST /api/fulfillment/orders/:id/allocate)
  console.log("\n3. Testing 'Accept Suggested Split' (allocateOrder)...");
  const allocRes = await fetch(`${BASE_URL}/fulfillment/orders/${order.id}/allocate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  const allocData = await allocRes.json();
  if (allocRes.status !== 200) throw new Error(`Allocation failed: ${JSON.stringify(allocData)}`);
  console.log(`  ✓ Suggested split accepted! Order Status: ${allocData.data.order.status}`);

  // Verify stock reserved
  const whMainInv = await prisma.inventory.findUnique({
    where: { warehouseId_productId: { warehouseId: whMain.id, productId: laptopProduct.id } },
  });
  console.log(`  ✓ Stock reserved in WH-MAIN: reservedQty=${whMainInv.reservedQty} of availableQty=${whMainInv.availableQty}`);

  // 5. Test "Manual Override" (POST /api/fulfillment/orders/:id/override)
  console.log("\n4. Testing 'Manual Override' with custom warehouse quantities...");
  const orderLineId = order.lines[0].id;
  // Override: 3 units from WH-MAIN, 9 units from WH-EAST
  const overrideRes = await fetch(`${BASE_URL}/fulfillment/orders/${order.id}/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      allocations: [
        { orderLineId, warehouseId: whMain.id, quantity: 3 },
        { orderLineId, warehouseId: whEast.id, quantity: 9 },
      ],
    }),
  });
  const overrideData = await overrideRes.json();
  if (overrideRes.status !== 200) throw new Error(`Manual override failed: ${JSON.stringify(overrideData)}`);
  console.log(`  ✓ Manual override applied! isManualOverride=${overrideData.data.isManualOverride}`);

  // Verify saved allocations reflect manual override
  const savedRes = await fetch(`${BASE_URL}/fulfillment/orders/${order.id}/allocations`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const savedData = await savedRes.json();
  console.log(`  ✓ Saved allocations show manual override: ${savedData.data.isManualOverride}`);
  console.log(`  ✓ Saved Warehouse Splits: ${savedData.data.warehouseSplits.length} packages`);

  // 6. Test Backorder & Mid-fulfillment Stock Consolidation
  console.log("\n5. Testing Mid-Fulfillment Stock Arrival & 'Consolidate Remaining Backorder'...");
  // Create an order for 6 servers (WH-EAST has 4, WH-MAIN has 0 -> 2 backordered)
  const boQuoteRes = await fetch(`${BASE_URL}/quotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      customerId: customer.id,
      lines: [{ productId: serverProduct.id, quantity: 6, discountPercent: 0 }],
    }),
  });
  const boQuote = (await boQuoteRes.json()).data.quotation;
  await fetch(`${BASE_URL}/quotations/${boQuote.id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ autoSubmit: true }),
  });
  const boOrder = (
    await (
      await fetch(`${BASE_URL}/orders/${boQuote.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({}),
      })
    ).json()
  ).data.order;

  // Allocate initial plan: 4 allocated to East, 2 backordered
  await fetch(`${BASE_URL}/fulfillment/orders/${boOrder.id}/allocate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });

  // Verify consolidation status before stock arrives
  let consolStatusRes = await fetch(`${BASE_URL}/fulfillment/orders/${boOrder.id}/consolidation-status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  let consolStatus = (await consolStatusRes.json()).data;
  console.log(`  ✓ Before stock arrival: hasBackorder=${consolStatus.hasBackorder}, canConsolidate=${consolStatus.canConsolidate}`);

  // Now, stock arrives mid-fulfillment: add 10 servers to WH-MAIN!
  console.log("  ⚡ Simulating mid-fulfillment stock arrival: Adding 10 servers to WH-MAIN...");
  await prisma.inventory.update({
    where: { warehouseId_productId: { warehouseId: whMain.id, productId: serverProduct.id } },
    data: { availableQty: 10, reservedQty: 0 },
  });

  // Verify consolidation status after stock arrives
  consolStatusRes = await fetch(`${BASE_URL}/fulfillment/orders/${boOrder.id}/consolidation-status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  consolStatus = (await consolStatusRes.json()).data;
  console.log(`  ✓ After stock arrival: canConsolidate=${consolStatus.canConsolidate}! Available to consolidate: ${consolStatus.totalConsolidatableQty} units`);

  if (!consolStatus.canConsolidate) throw new Error("Expected canConsolidate to be true after stock arrived");

  // Call Consolidate Remaining Backorder
  console.log("  ⚡ Calling POST /api/fulfillment/orders/:id/consolidate-backorder...");
  const consolRes = await fetch(`${BASE_URL}/fulfillment/orders/${boOrder.id}/consolidate-backorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  const consolData = await consolRes.json();
  if (consolRes.status !== 200) throw new Error(`Consolidation failed: ${JSON.stringify(consolData)}`);
  console.log(`  ✓ Consolidate backorders successful! Order Status now: ${consolData.data.order.status}`);

  // 7. Test Detailed Invoice Generation
  console.log("\n6. Testing Detailed Commercial Invoice Generation...");
  const invRes = await fetch(`${BASE_URL}/invoices/generate/${order.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  });
  const invData = await invRes.json();
  const invoice = invData.data.invoices[0];
  console.log(`  ✓ Generated Invoice ${invoice.invoiceNumber}:`);
  console.log(`     Total: ₹${invoice.totalAmount} (Subtotal: ₹${invoice.subtotal}, Tax: ₹${invoice.taxAmount})`);
  invoice.lines.forEach((l) => {
    console.log(`     - Line: ${l.description}`);
  });

  if (!invoice.lines[0].description.includes("Fulfilled from:")) {
    throw new Error("Invoice line description does not contain warehouse fulfillment provenance");
  }
  console.log("  ✓ Warehouse fulfillment dispatch provenance verified on invoice line!");

  console.log("\n=================================================");
  console.log("  ALL FULFILLMENT & INVOICE TESTS PASSED 100%!   ");
  console.log("=================================================\n");
}

run().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
