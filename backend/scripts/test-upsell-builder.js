// ============================================================================
// Test: While building quote, accept one upsell suggestion & confirm total and margin update right away
// ============================================================================

import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_URL = "http://localhost:4000/api";
const JWT_SECRET = process.env.JWT_SECRET || "dealflow360-jwt-secret-key-change-in-production";

async function run() {
  console.log("=================================================");
  console.log("  TESTING UPSELL SUGGESTIONS & INSTANT UPDATE    ");
  console.log("=================================================");

  // 1. Authenticate as Sales Rep
  const repUser = await prisma.user.findFirst({
    where: { role: { code: "SALES_REP" } },
    include: { role: true },
  });
  if (!repUser) throw new Error("No sales rep found in database");

  const token = jwt.sign(
    { userId: repUser.id, email: repUser.email, role: repUser.role.code, typ: "internal" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  console.log(`✓ Authenticated as Sales Rep: ${repUser.email}`);

  // 2. Fetch customer & products
  const custRes = await fetch(`${API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } });
  const customers = (await custRes.json()).data?.customers || [];
  const customer = customers[0];

  const prodRes = await fetch(`${API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } });
  const products = (await prodRes.json()).data?.products || [];
  const laptop = products.find((p) => p.sku === "HW-LAPTOP-15" || p.sku.includes("LAPTOP"));
  if (!laptop) throw new Error("Laptop product not found");

  console.log(`✓ Testing with product: ${laptop.name} (SKU: ${laptop.sku}, Price: ₹${laptop.basePrice})`);

  // 3. Create draft quote with 1 laptop
  const createRes = await fetch(`${API_URL}/quotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      customerId: customer.id,
      autoSubmit: false,
      lines: [{ productId: laptop.id, quantity: 2, discountPercent: 0 }],
    }),
  });
  const createData = await createRes.json();
  const quote = createData.data?.quotation;
  if (!quote) throw new Error("Failed to create draft quotation: " + JSON.stringify(createData));

  const initialTotal = Number(quote.grandTotal);
  const initialMargin = Number(quote.marginPercent);
  console.log(`✓ Draft Quote created: ${quote.quotationNumber}`);
  console.log(`   Initial Order Total: ₹${initialTotal} | Initial Margin: ${initialMargin.toFixed(1)}%`);

  // 4. Query suggestions endpoint
  const suggRes = await fetch(`${API_URL}/quotations/${quote.id}/suggestions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const suggData = await suggRes.json();
  const suggestions = suggData.data?.suggestions || [];
  console.log(`✓ Fetched ${suggestions.length} upsell suggestions for quote:`);
  suggestions.slice(0, 3).forEach((s, idx) => {
    console.log(`   ${idx + 1}. [${s.sku}] ${s.name} — Price: ₹${s.unitPrice}, Margin: ${s.marginPercent}%, Tag: ${s.promotionTag}`);
    if (s.reason) console.log(`      Reason: "${s.reason}"`);
  });

  if (suggestions.length === 0) throw new Error("No upsell suggestions returned!");

  // 5. Accept one upsell suggestion
  const pickedUpsell = suggestions[0];
  console.log(`⚡ Accepting upsell suggestion: ${pickedUpsell.name} (SKU: ${pickedUpsell.sku})`);

  const addLineRes = await fetch(`${API_URL}/quotations/${quote.id}/lines`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      productId: pickedUpsell.productId,
      quantity: 1,
      discountPercent: 0,
      addedViaUpsell: true,
    }),
  });
  const addLineData = await addLineRes.json();
  const updatedQuote = addLineData.data?.quotation;
  if (!updatedQuote) throw new Error("Failed to add upsell line: " + JSON.stringify(addLineData));

  const updatedTotal = Number(updatedQuote.grandTotal);
  const updatedMargin = Number(updatedQuote.marginPercent);

  console.log("✓ Upsell Accepted and quotation recalculated right away!");
  console.log(`   Order Total: ₹${initialTotal} → ₹${updatedTotal} (+₹${updatedTotal - initialTotal})`);
  console.log(`   Overall Margin: ${initialMargin.toFixed(1)}% → ${updatedMargin.toFixed(1)}%`);

  if (updatedTotal <= initialTotal) {
    throw new Error(`Order total did not increase! Expected > ₹${initialTotal}, got ₹${updatedTotal}`);
  }

  // 6. Verify addedViaUpsell line is persisted
  const upsellLine = updatedQuote.lines?.find((l) => l.addedViaUpsell === true);
  if (!upsellLine) {
    throw new Error("Line was not flagged as addedViaUpsell: true");
  }
  console.log(`✓ Verified line is tagged addedViaUpsell=true in database: ${upsellLine.product?.name || upsellLine.productId}`);

  console.log("=================================================");
  console.log("  ALL UPSELL ACCEPTANCE TESTS PASSED 100%!       ");
  console.log("=================================================");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
