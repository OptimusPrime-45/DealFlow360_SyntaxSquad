import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const API_URL = "http://localhost:4000/api";
const JWT_SECRET = process.env.JWT_SECRET || "dev-internal-secret-change-me";

async function run() {
  console.log("=================================================");
  console.log("  TESTING PAIRWISE WAREHOUSE SHIPPING WEIGHTS    ");
  console.log("=================================================");

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

  // 1. Test GET /api/warehouses/shipping-weights
  console.log("1. Fetching shipping weights and 2D matrix...");
  const weightsRes = await fetch(`${API_URL}/warehouses/shipping-weights`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const weightsData = await weightsRes.json();
  if (!weightsRes.ok) throw new Error(`Failed to fetch shipping weights: ${JSON.stringify(weightsData)}`);

  console.log(`  ✓ Successfully fetched ${weightsData.data.routes.length} pair routes.`);
  console.log(`  ✓ Warehouses in matrix: ${weightsData.data.warehouses.map(w => w.code).join(", ")}`);
  console.log("  Sample matrix row (first warehouse):", weightsData.data.warehouses[0]?.code, "->", weightsData.data.matrix[weightsData.data.warehouses[0]?.id]);

  // 2. Test POST /api/warehouses with pairWeights
  console.log("\n2. Onboarding new warehouse 'WH-PUNE' with explicit pairwise weights to all existing warehouses...");
  const existingWhs = weightsData.data.warehouses;
  const pairWeights = {};
  existingWhs.forEach((w, idx) => {
    pairWeights[w.id] = Number((1.2 + idx * 0.5).toFixed(1));
  });

  const testCode = `WH-PUNE-${Date.now().toString().slice(-4)}`;
  const createWhRes = await fetch(`${API_URL}/warehouses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      code: testCode,
      name: "Pune Logistics Hub",
      address: "Hinjawadi IT Park, Pune",
      pairWeights,
    }),
  });

  const createWhData = await createWhRes.json();
  if (!createWhRes.ok) throw new Error(`Failed to create warehouse: ${JSON.stringify(createWhData)}`);

  const createdWh = createWhData.data.warehouse;
  console.log(`  ✓ Created warehouse ${createdWh.code} (ID: ${createdWh.id})`);
  console.log(`  ✓ Connected outbound routes count: ${createdWh.routesFrom?.length || 0}`);

  if ((createdWh.routesFrom?.length || 0) !== existingWhs.length) {
    throw new Error(`Expected ${existingWhs.length} outbound routes, got ${createdWh.routesFrom?.length}`);
  }

  // 3. Verify in database that bidirectional pairs exist
  const dbRoutes = await prisma.warehouseShippingWeight.findMany({
    where: {
      OR: [
        { fromWarehouseId: createdWh.id },
        { toWarehouseId: createdWh.id },
      ],
    },
    include: {
      fromWarehouse: { select: { code: true } },
      toWarehouse: { select: { code: true } },
    },
  });

  console.log(`  ✓ Verified total ${dbRoutes.length} bidirectional routes for ${createdWh.code} in DB:`);
  dbRoutes.forEach(r => {
    console.log(`     Route ${r.fromWarehouse.code} -> ${r.toWarehouse.code}: Weight = ${r.weight}`);
  });

  if (dbRoutes.length !== existingWhs.length * 2) {
    throw new Error(`Expected ${existingWhs.length * 2} directed routes, got ${dbRoutes.length}`);
  }

  // 4. Test PUT /api/warehouses/shipping-weights (Update pair weight)
  console.log("\n3. Testing updating a pair weight via PUT /api/warehouses/shipping-weights...");
  const targetOtherWh = existingWhs[0];
  const updateRes = await fetch(`${API_URL}/warehouses/shipping-weights`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fromWarehouseId: createdWh.id,
      toWarehouseId: targetOtherWh.id,
      weight: 4.5,
      bidirectional: true,
    }),
  });

  const updateData = await updateRes.json();
  if (!updateRes.ok) throw new Error(`Failed to update shipping weight: ${JSON.stringify(updateData)}`);
  console.log(`  ✓ Updated weight between ${createdWh.code} and ${targetOtherWh.code} to 4.5 (Bidirectional)`);

  const verifyRoute1 = await prisma.warehouseShippingWeight.findUnique({
    where: { fromWarehouseId_toWarehouseId: { fromWarehouseId: createdWh.id, toWarehouseId: targetOtherWh.id } },
  });
  const verifyRoute2 = await prisma.warehouseShippingWeight.findUnique({
    where: { fromWarehouseId_toWarehouseId: { fromWarehouseId: targetOtherWh.id, toWarehouseId: createdWh.id } },
  });

  if (Number(verifyRoute1.weight) !== 4.5 || Number(verifyRoute2.weight) !== 4.5) {
    throw new Error(`Weights not updated properly: ${verifyRoute1.weight}, ${verifyRoute2.weight}`);
  }
  console.log("  ✓ Both directed routes verified updated in database.");

  // 5. Test DELETE cascading
  console.log("\n4. Deleting test warehouse and verifying cascading deletion of pair routes...");
  const deleteRes = await fetch(`${API_URL}/warehouses/${createdWh.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!deleteRes.ok) throw new Error("Failed to delete test warehouse");

  const remainingRoutes = await prisma.warehouseShippingWeight.count({
    where: {
      OR: [
        { fromWarehouseId: createdWh.id },
        { toWarehouseId: createdWh.id },
      ],
    },
  });

  if (remainingRoutes !== 0) {
    throw new Error(`Expected 0 remaining routes for deleted warehouse, found ${remainingRoutes}`);
  }
  console.log("  ✓ All pairwise routes cleanly cascaded upon warehouse deletion.");

  console.log("\n=================================================");
  console.log("  ALL PAIRWISE SHIPPING WEIGHT TESTS PASSED!     ");
  console.log("=================================================");
}

run()
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
