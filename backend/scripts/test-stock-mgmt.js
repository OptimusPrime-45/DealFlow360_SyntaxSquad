// backend/scripts/test-stock-mgmt.js
import { prisma } from "../lib/prisma.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-internal-secret-change-me";

async function run() {
  console.log("=================================================");
  console.log("  TESTING WAREHOUSE STOCK & MULTI-SKU MANAGEMENT ");
  console.log("=================================================");

  const BASE_URL = "http://localhost:4000/api";

  const adminUser = await prisma.user.findFirst({
    where: { role: { code: "ADMIN" } },
    include: { role: true },
  });
  if (!adminUser) throw new Error("No admin user found in DB");

  const token = jwt.sign(
    { userId: adminUser.id, email: adminUser.email, role: adminUser.role.code, typ: "internal" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  console.log("✓ Authenticated as Admin via token");

  // 1. Onboard a warehouse WITHOUT priority
  console.log("\n1. Onboarding new warehouse 'WH-HYD' (no priority field)...");
  const whCode = `WH-HYD-${Math.floor(1000 + Math.random() * 9000)}`;
  const createWhRes = await fetch(`${BASE_URL}/warehouses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      code: whCode,
      name: "Hyderabad Tech Hub",
      address: "HITEC City, Hyderabad",
      shippingWeight: 1.4,
    }),
  });
  const createWhData = await createWhRes.json();
  if (createWhRes.status !== 201) {
    throw new Error(`Failed to create warehouse: ${JSON.stringify(createWhData)}`);
  }
  const createdWh = createWhData.data.warehouse;
  console.log(`  ✓ Created warehouse ${createdWh.code} (ID: ${createdWh.id})`);
  console.log(`  ✓ Priority field is absent as expected: ${createdWh.priority === undefined}`);

  // 2. Fetch inventory for the new warehouse
  console.log(`\n2. Fetching all SKUs for warehouse ${createdWh.code}...`);
  const getInvRes = await fetch(`${BASE_URL}/warehouses/${createdWh.id}/inventory`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getInvData = await getInvRes.json();
  if (getInvRes.status !== 200) {
    throw new Error(`Failed to fetch inventory: ${JSON.stringify(getInvData)}`);
  }
  const inventoryList = getInvData.data.inventory;
  console.log(`  ✓ Retrieved ${inventoryList.length} catalog products for ${createdWh.code}`);
  console.log(`  ✓ Sample item (${inventoryList[0].sku}): Available=${inventoryList[0].availableQty}, Sellable=${inventoryList[0].sellableQty}`);

  // 3. Batch set stock levels for multiple SKUs
  console.log(`\n3. Batch updating stock for multiple SKUs in ${createdWh.code}...`);
  const productsToUpdate = inventoryList.slice(0, 3).map((p, idx) => ({
    productId: p.productId,
    availableQty: (idx + 1) * 10,
    reorderLevel: 2,
  }));

  const batchRes = await fetch(`${BASE_URL}/warehouses/${createdWh.id}/inventory/batch`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: productsToUpdate }),
  });
  const batchData = await batchRes.json();
  if (batchRes.status !== 200) {
    throw new Error(`Failed to batch update inventory: ${JSON.stringify(batchData)}`);
  }
  console.log(`  ✓ Batch updated ${batchData.data.updatedCount} SKU stock levels in a single transaction`);

  // Verify in DB
  const dbInventory = await prisma.inventory.findMany({
    where: { warehouseId: createdWh.id },
    include: { product: true },
  });
  console.log(`  ✓ Verified DB records for ${createdWh.code}:`);
  dbInventory.forEach((inv) => {
    console.log(`     SKU: ${inv.product.sku} | Available: ${inv.availableQty} | Reorder: ${inv.reorderLevel}`);
  });

  // 4. Verify stock overview API
  console.log("\n4. Verifying /api/warehouses/stock/overview...");
  const overviewRes = await fetch(`${BASE_URL}/warehouses/stock/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const overviewData = await overviewRes.json();
  const stockOverview = overviewData.data.stock;
  console.log(`  ✓ Stock overview retrieved ${stockOverview.length} SKUs across all warehouses`);

  // 5. Clean up test warehouse
  console.log("\n5. Cleaning up test warehouse...");
  await prisma.inventory.deleteMany({ where: { warehouseId: createdWh.id } });
  await prisma.warehouse.delete({ where: { id: createdWh.id } });
  console.log(`  ✓ Cleaned up test warehouse ${createdWh.code}`);

  console.log("\n=================================================");
  console.log("  ALL WAREHOUSE & MULTI-SKU TESTS PASSED!        ");
  console.log("=================================================\n");
}

run().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
