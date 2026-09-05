import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. System Roles
  const rolesData = [
    { code: "ADMIN", name: "Administrator", isSystem: true },
    { code: "SALES_REP", name: "Sales Representative", isSystem: true },
    { code: "SALES_MANAGER", name: "Sales Manager", isSystem: true },
    { code: "FINANCE", name: "Finance", isSystem: true },
  ];

  const roles = {};
  for (const r of rolesData) {
    roles[r.code] = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    });
  }
  console.log("✔ Roles seeded");

  // 2. Demo Users for Each Role (Password: Password123!)
  const defaultPasswordHash = await bcrypt.hash("Password123!", 10);
  const demoUsers = [
    {
      email: "admin@dealflow360.com",
      fullName: "System Administrator",
      roleCode: "ADMIN",
    },
    {
      email: "rep@dealflow360.com",
      fullName: "Alex Sales Rep",
      roleCode: "SALES_REP",
    },
    {
      email: "manager@dealflow360.com",
      fullName: "Sarah Sales Manager",
      roleCode: "SALES_MANAGER",
    },
    {
      email: "finance@dealflow360.com",
      fullName: "Frank Finance Ops",
      roleCode: "FINANCE",
    },
  ];

  const users = {};
  for (const u of demoUsers) {
    users[u.roleCode] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: defaultPasswordHash,
        fullName: u.fullName,
        roleId: roles[u.roleCode].id,
        isActive: true,
      },
    });
  }
  console.log("✔ Demo users seeded");

  // 3. Singleton Governance Settings
  await prisma.governanceSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      scoreStrategy: "VALUE_WEIGHTED",
      unconfiguredCeilingPolicy: "DENY",
      stalledAfterDays: 7,
      anomalyDeviationPoints: 5,
    },
  });
  console.log("✔ Governance settings seeded");

  // 4. Customer Tiers
  const tiersData = [
    { code: "BRONZE", name: "Bronze Tier", rank: 1, maxDiscountPercent: 5.0 },
    { code: "SILVER", name: "Silver Tier", rank: 2, maxDiscountPercent: 10.0 },
    { code: "GOLD", name: "Gold Tier", rank: 3, maxDiscountPercent: 15.0 },
  ];

  const tiers = {};
  for (const t of tiersData) {
    tiers[t.code] = await prisma.customerTier.upsert({
      where: { code: t.code },
      update: { maxDiscountPercent: t.maxDiscountPercent },
      create: t,
    });
  }
  console.log("✔ Customer tiers seeded");

  // 5. Product Categories
  const categoriesData = [
    {
      name: "Hardware",
      description: "High-performance business laptops, workstations, and servers",
    },
    {
      name: "Professional Services",
      description: "Setup, implementation, architecture, and consulting services",
    },
    {
      name: "SaaS Subscriptions",
      description: "Recurring cloud platform licenses and support packages",
    },
  ];

  const categories = {};
  for (const c of categoriesData) {
    categories[c.name] = await prisma.productCategory.upsert({
      where: { name: c.name },
      update: { description: c.description },
      create: c,
    });
  }
  console.log("✔ Product categories seeded");

  // 6. Products (from PRD §10 worked examples)
  const productsData = [
    {
      sku: "HW-LAPTOP-15",
      name: "Enterprise Laptop Pro 15",
      description: "High-end corporate laptop (16GB RAM, 512GB SSD)",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 1000.0,
      costPrice: 700.0,
      unit: "unit",
      isPromoted: true,
    },
    {
      sku: "HW-SERVER-2U",
      name: "Rackmount Server 2U",
      description: "Enterprise rackmount server for datacenter deployment",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 4500.0,
      costPrice: 3200.0,
      unit: "unit",
      isPromoted: false,
    },
    {
      sku: "SRV-SETUP-01",
      name: "Onsite Setup & Configuration",
      description: "Comprehensive installation and initial configuration",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 200.0,
      costPrice: 160.0,
      unit: "hour",
      isPromoted: true,
    },
    {
      sku: "SRV-CONSULT-01",
      name: "Enterprise Architecture Consulting",
      description: "Dedicated strategic consulting & cloud migration planning",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 500.0,
      costPrice: 380.0,
      unit: "day",
      isPromoted: false,
    },
    {
      sku: "SUB-CLOUD-ENT",
      name: "DealFlow Cloud Enterprise Plan",
      description: "Monthly subscription per user license",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 60.0,
      costPrice: 15.0,
      unit: "seat/month",
      isPromoted: true,
    },
  ];

  for (const p of productsData) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: p,
      create: p,
    });
  }
  console.log("✔ Products seeded");

  // 7. Customers (Spanning tiers)
  const customersData = [
    {
      name: "Acme Global Industries",
      contactEmail: "john@acmeglobal.com",
      phone: "+91 98765 43210",
      billingAddress: "Tech Park, Whitefield, Bengaluru",
      customerTierId: tiers["GOLD"].id,
      ownerRepId: users["SALES_REP"].id,
    },
    {
      name: "Nexus Retail Solutions",
      contactEmail: "sarah@nexusretail.com",
      phone: "+91 98765 11223",
      billingAddress: "Cyber City, Gurugram, Haryana",
      customerTierId: tiers["SILVER"].id,
      ownerRepId: users["SALES_REP"].id,
    },
    {
      name: "Starlight Digital Studio",
      contactEmail: "contact@starlight.io",
      phone: "+91 98765 99887",
      billingAddress: "Bandra Kurla Complex, Mumbai",
      customerTierId: tiers["BRONZE"].id,
      ownerRepId: users["SALES_REP"].id,
    },
  ];

  for (const c of customersData) {
    await prisma.customer.upsert({
      where: { contactEmail: c.contactEmail },
      update: c,
      create: c,
    });
  }
  console.log("✔ Customers seeded");

  // 8. Category Discount Ceilings (DiscountRules matching PDF §10)
  // Gold: Hardware 15%, Services 10%
  // Silver: Hardware 10%, Services 5%
  // Bronze: Hardware 5%, Services 2%
  const discountRulesData = [
    {
      customerTierId: tiers["GOLD"].id,
      categoryId: categories["Hardware"].id,
      maxDiscountPercent: 15.0,
      minMarginPercent: 20.0,
    },
    {
      customerTierId: tiers["GOLD"].id,
      categoryId: categories["Professional Services"].id,
      maxDiscountPercent: 10.0,
      minMarginPercent: 15.0,
    },
    {
      customerTierId: tiers["SILVER"].id,
      categoryId: categories["Hardware"].id,
      maxDiscountPercent: 10.0,
      minMarginPercent: 20.0,
    },
    {
      customerTierId: tiers["SILVER"].id,
      categoryId: categories["Professional Services"].id,
      maxDiscountPercent: 5.0,
      minMarginPercent: 15.0,
    },
    {
      customerTierId: tiers["BRONZE"].id,
      categoryId: categories["Hardware"].id,
      maxDiscountPercent: 5.0,
      minMarginPercent: 20.0,
    },
    {
      customerTierId: tiers["BRONZE"].id,
      categoryId: categories["Professional Services"].id,
      maxDiscountPercent: 2.0,
      minMarginPercent: 15.0,
    },
  ];

  for (const dr of discountRulesData) {
    const existing = await prisma.discountRule.findFirst({
      where: {
        customerTierId: dr.customerTierId,
        categoryId: dr.categoryId,
      },
    });

    if (existing) {
      await prisma.discountRule.update({
        where: { id: existing.id },
        data: dr,
      });
    } else {
      await prisma.discountRule.create({
        data: dr,
      });
    }
  }
  console.log("✔ Discount rules seeded");

  // 9. Default Approval Policy & Ladder
  const defaultPolicy = await prisma.approvalPolicy.upsert({
    where: { name: "Standard Approval Ladder" },
    update: { isActive: true },
    create: {
      name: "Standard Approval Ladder",
      isActive: true,
    },
  });

  // A rung fires when EITHER trigger is crossed:
  //     blendedScore >= minBlendedScore  OR  worstLineOverage >= minWorstLineOverage
  //
  // The two thresholds MUST differ. They were previously seeded equal
  // (5/5 and 15/15), which made the blended dimension inert: any quote
  // reaching blended >= 5 had almost certainly already tripped worst-line >= 5,
  // so worst-line alone made every identical decision. That switches off the
  // exact property PDF §10 exists to describe — many small violations, none
  // alarming alone, adding up across the order.
  //
  // Calibration against the documented cases:
  //   §10 hero    blended 1.33, worst 8  -> step 1 only (worst >= 5)   = Manager
  //   many-small  blended 2.79, worst 3  -> step 1 only (blended >= 2) = Manager
  //   clean quote blended 0,    worst 0  -> nothing fires
  //   severe      blended 8,    worst 20 -> steps 1 and 2  = Manager then Finance
  const ladderSteps = [
    {
      roleId: roles["SALES_MANAGER"].id,
      stepOrder: 1,
      minBlendedScore: 2.0,
      minWorstLineOverage: 5.0,
    },
    {
      roleId: roles["FINANCE"].id,
      stepOrder: 2,
      minBlendedScore: 6.0,
      minWorstLineOverage: 12.0,
    },
  ];

  // Upsert rather than create-if-empty, so re-running the seed actually applies
  // threshold changes instead of silently keeping the old ladder.
  for (const step of ladderSteps) {
    const existing = await prisma.approvalPolicyStep.findFirst({
      where: { approvalPolicyId: defaultPolicy.id, stepOrder: step.stepOrder },
    });

    if (existing) {
      await prisma.approvalPolicyStep.update({
        where: { id: existing.id },
        data: step,
      });
    } else {
      await prisma.approvalPolicyStep.create({
        data: { approvalPolicyId: defaultPolicy.id, ...step },
      });
    }
  }
  console.log("✔ Default approval ladder seeded");

  // ==========================================================================
  // 10. Warehouses & Inventory  (§9 steps 1 and 5)
  // ==========================================================================
  const warehousesData = [
    {
      code: "WH-MAIN",
      name: "Main Warehouse",
      address: "Plot 12, Industrial Area, Bengaluru",
      shippingWeight: 1.0, // cheapest to ship from — the split prefers this
      priority: 10,
    },
    {
      code: "WH-EAST",
      name: "East Depot",
      address: "Sector 5, Salt Lake, Kolkata",
      shippingWeight: 1.8,
      priority: 5,
    },
  ];

  const warehouses = {};
  for (const w of warehousesData) {
    warehouses[w.code] = await prisma.warehouse.upsert({
      where: { code: w.code },
      update: w,
      create: w,
    });
  }
  console.log("✔ Warehouses seeded");

  const productBySku = {};
  for (const p of productsData) {
    productBySku[p.sku] = await prisma.product.findUnique({
      where: { sku: p.sku },
    });
  }

  // Stock is deliberately arranged so that NEITHER warehouse alone can cover a
  // 12-unit laptop order: Main holds 5, East holds 9. That is what forces the
  // two-warehouse split in §9 step 5 instead of it being a happy accident.
  // HW-SERVER-2U is stocked only in East, and SRV/SUB lines are non-stocked.
  const inventoryData = [
    { sku: "HW-LAPTOP-15", code: "WH-MAIN", availableQty: 5, reorderLevel: 3 },
    { sku: "HW-LAPTOP-15", code: "WH-EAST", availableQty: 9, reorderLevel: 3 },
    { sku: "HW-SERVER-2U", code: "WH-MAIN", availableQty: 0, reorderLevel: 2 },
    { sku: "HW-SERVER-2U", code: "WH-EAST", availableQty: 4, reorderLevel: 2 },
  ];

  for (const inv of inventoryData) {
    const productId = productBySku[inv.sku].id;
    const warehouseId = warehouses[inv.code].id;

    await prisma.inventory.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      update: {
        availableQty: inv.availableQty,
        reorderLevel: inv.reorderLevel,
      },
      create: {
        warehouseId,
        productId,
        availableQty: inv.availableQty,
        reservedQty: 0,
        reorderLevel: inv.reorderLevel,
      },
    });
  }
  console.log("✔ Inventory seeded (laptop stock forces a two-warehouse split)");

  // ==========================================================================
  // 11. Subscription Plans  (§9 steps 1 and 6)
  // ==========================================================================
  const subscriptionProductId = productBySku["SUB-CLOUD-ENT"].id;

  const plansData = [
    {
      name: "Cloud Enterprise — Monthly",
      billingInterval: "MONTHLY",
      price: 60.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      name: "Cloud Enterprise — Quarterly",
      billingInterval: "QUARTERLY",
      price: 170.0,
      prorationEnabled: true,
      cancellationRefundPercent: 50.0,
    },
    {
      name: "Cloud Enterprise — Yearly",
      billingInterval: "YEARLY",
      price: 640.0,
      prorationEnabled: true,
      cancellationRefundPercent: 75.0,
    },
  ];

  for (const plan of plansData) {
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { name: plan.name },
    });

    if (existing) {
      await prisma.subscriptionPlan.update({
        where: { id: existing.id },
        data: { ...plan, productId: subscriptionProductId },
      });
    } else {
      await prisma.subscriptionPlan.create({
        data: { ...plan, productId: subscriptionProductId },
      });
    }
  }
  console.log("✔ Subscription plans seeded");

  // ==========================================================================
  // 12. Upsell / Cross-sell pairings  (§9 step 4)
  //
  // PDF §4-A6 says pairings come from "historical co purchase data". There is
  // no history on a fresh database, so these are entered by hand — coPurchaseCount
  // stands in for the observed frequency and drives ranking alongside
  // Product.isPromoted. minMarginPercent keeps thin-margin suggestions hidden.
  // ==========================================================================
  const coPurchaseData = [
    { source: "HW-LAPTOP-15", suggested: "SRV-SETUP-01", coPurchaseCount: 48, weight: 1.5, minMarginPercent: 10.0 },
    { source: "HW-LAPTOP-15", suggested: "SUB-CLOUD-ENT", coPurchaseCount: 35, weight: 1.2, minMarginPercent: 20.0 },
    { source: "HW-SERVER-2U", suggested: "SRV-CONSULT-01", coPurchaseCount: 27, weight: 1.4, minMarginPercent: 10.0 },
    { source: "HW-SERVER-2U", suggested: "SRV-SETUP-01", coPurchaseCount: 19, weight: 1.0, minMarginPercent: 10.0 },
    { source: "SRV-CONSULT-01", suggested: "SUB-CLOUD-ENT", coPurchaseCount: 12, weight: 0.9, minMarginPercent: 20.0 },
  ];

  for (const cp of coPurchaseData) {
    const sourceProductId = productBySku[cp.source].id;
    const suggestedProductId = productBySku[cp.suggested].id;

    await prisma.coPurchaseRule.upsert({
      where: {
        sourceProductId_suggestedProductId: { sourceProductId, suggestedProductId },
      },
      update: {
        coPurchaseCount: cp.coPurchaseCount,
        weight: cp.weight,
        minMarginPercent: cp.minMarginPercent,
        isActive: true,
      },
      create: {
        sourceProductId,
        suggestedProductId,
        coPurchaseCount: cp.coPurchaseCount,
        weight: cp.weight,
        minMarginPercent: cp.minMarginPercent,
      },
    });
  }
  console.log("✔ Co-purchase (upsell) rules seeded");

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
