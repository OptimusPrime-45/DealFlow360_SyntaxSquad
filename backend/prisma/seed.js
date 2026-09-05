import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateLineMath, round2, toNum } from "../lib/money.js";

const prisma = new PrismaClient();

async function main() {
  console.log("\n======================================================================");
  console.log(" DEALFLOW360 — COMPREHENSIVE SEED SCRIPT (CONSISTENT DUMMY DATA)");
  console.log("======================================================================\n");

  // ==========================================================================
  // 1. System Roles
  // ==========================================================================
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
  console.log("✔ Roles seeded (ADMIN, SALES_REP, SALES_MANAGER, FINANCE)");

  // ==========================================================================
  // 2. Demo Users for Each Role (Password: Password123!)
  // ==========================================================================
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
      email: "priya@dealflow360.com",
      fullName: "Priya Sharma (Senior Rep)",
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
    users[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        roleId: roles[u.roleCode].id,
      },
      create: {
        email: u.email,
        passwordHash: defaultPasswordHash,
        fullName: u.fullName,
        roleId: roles[u.roleCode].id,
        isActive: true,
      },
    });
    // Convenience lookup by role
    if (!users[u.roleCode]) {
      users[u.roleCode] = users[u.email];
    }
  }
  console.log("✔ Demo users seeded (admin, rep, priya, manager, finance: Password123!)");

  // ==========================================================================
  // 3. Singleton Governance Settings
  // ==========================================================================
  await prisma.governanceSetting.upsert({
    where: { id: "singleton" },
    update: {
      scoreStrategy: "VALUE_WEIGHTED",
      unconfiguredCeilingPolicy: "DENY",
      stalledAfterDays: 7,
      anomalyDeviationPoints: 5.0,
    },
    create: {
      id: "singleton",
      scoreStrategy: "VALUE_WEIGHTED",
      unconfiguredCeilingPolicy: "DENY",
      stalledAfterDays: 7,
      anomalyDeviationPoints: 5.0,
    },
  });
  console.log("✔ Governance setting singleton seeded (VALUE_WEIGHTED, DENY, 7 days)");

  // ==========================================================================
  // 4. Customer Tiers
  // ==========================================================================
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
  console.log("✔ Customer tiers seeded (BRONZE 5%, SILVER 10%, GOLD 15%)");

  // ==========================================================================
  // 5. Product Categories
  // ==========================================================================
  const categoriesData = [
    {
      name: "Hardware",
      description: "High-performance business laptops, workstations, rack servers, and networking gear [TYPE:ONE_TIME]",
    },
    {
      name: "Professional Services",
      description: "Setup, architecture consulting, implementation, and cloud migration services [TYPE:SERVICE]",
    },
    {
      name: "SaaS Subscriptions",
      description: "Recurring cloud licenses, API access tiers, and enterprise platform seats [TYPE:SUBSCRIPTION]",
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
  console.log("✔ Product categories seeded (Hardware, Professional Services, SaaS Subscriptions)");

  // ==========================================================================
  // 6. Products
  // ==========================================================================
  const productsData = [
    {
      sku: "HW-LAPTOP-15",
      name: "Enterprise Laptop Pro 15",
      description: "High-end corporate laptop (16GB RAM, 512GB SSD, Intel i7)",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 1000.0,
      costPrice: 700.0,
      unit: "unit",
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "HW-SERVER-2U",
      name: "Rackmount Server 2U",
      description: "Enterprise dual-socket rackmount server for datacenter deployment",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 4500.0,
      costPrice: 3200.0,
      unit: "unit",
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "HW-DESKTOP-ULTRA",
      name: "Ultra Workstation Pro",
      description: "Tower workstation for engineering, 3D CAD, and computational finance",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 2200.0,
      costPrice: 1550.0,
      unit: "unit",
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "HW-MONITOR-27",
      name: 'UltraSharp 4K Monitor 27"',
      description: "Professional IPS display with USB-C 90W power delivery and color calibration",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 450.0,
      costPrice: 310.0,
      unit: "unit",
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "HW-ROUTER-MESH",
      name: "Enterprise WiFi-6 Mesh Router",
      description: "Tri-band enterprise access point with PoE+ and remote zero-touch orchestration",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 350.0,
      costPrice: 220.0,
      unit: "unit",
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "SRV-SETUP-01",
      name: "Onsite Setup & Configuration",
      description: "Comprehensive installation, hardening, and initial fleet configuration",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 200.0,
      costPrice: 160.0,
      unit: "hour",
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SRV-CONSULT-01",
      name: "Enterprise Architecture Consulting",
      description: "Dedicated strategic consulting, hybrid topology design, and security audit",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 500.0,
      costPrice: 380.0,
      unit: "day",
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "SRV-SUPPORT-247",
      name: "24/7 Dedicated IT Support SLA",
      description: "Round-the-clock priority ticketing, 15-minute response SLA, and named engineer support",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 800.0,
      costPrice: 520.0,
      unit: "month",
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SRV-MAINT-FLEET",
      name: "Hardware Preventive Maintenance",
      description: "Periodic physical inspection, thermal repasting, diagnostic benchmark, and cleaning",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 350.0,
      costPrice: 210.0,
      unit: "visit",
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "SUB-CLOUD-ENT",
      name: "DealFlow Cloud Enterprise Plan",
      description: "Monthly subscription per user license with high-priority support SLA",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 60.0,
      costPrice: 15.0,
      unit: "seat/month",
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SUB-CRM-PRO",
      name: "DealFlow CRM Pro Suite",
      description: "Enterprise sales pipeline management, lead scoring, and automated deal intelligence",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 45.0,
      costPrice: 10.0,
      unit: "seat/month",
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SUB-BACKUP-PRO",
      name: "Managed Cloud Backup Pro",
      description: "Continuous encrypted cloud backup with automated disaster recovery orchestration",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 40.0,
      costPrice: 8.0,
      unit: "server/month",
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "SUB-SECURITY-SHIELD",
      name: "Zero-Trust Endpoint Security",
      description: "Next-gen EDR, cloud vulnerability scanning, and real-time behavioral telemetry",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 25.0,
      costPrice: 5.0,
      unit: "endpoint/month",
      taxRate: 18.0,
      isPromoted: false,
    },
  ];

  const products = {};
  for (const p of productsData) {
    products[p.sku] = await prisma.product.upsert({
      where: { sku: p.sku },
      update: p,
      create: p,
    });
  }
  console.log("✔ Products seeded (Laptops, Servers, Workstations, Setup, Consulting, Cloud SaaS)");

  // ==========================================================================
  // 7. Product Variants (PDF §4-A2)
  // ==========================================================================
  const variantsData = [
    {
      productId: products["HW-LAPTOP-15"].id,
      attribute: "RAM",
      value: "32GB (+₹150)",
      extraPrice: 150.0,
    },
    {
      productId: products["HW-LAPTOP-15"].id,
      attribute: "Storage",
      value: "1TB NVMe (+₹100)",
      extraPrice: 100.0,
    },
    {
      productId: products["HW-DESKTOP-ULTRA"].id,
      attribute: "GPU",
      value: "NVIDIA RTX 4080 (+₹600)",
      extraPrice: 600.0,
    },
  ];

  for (const v of variantsData) {
    await prisma.productVariant.upsert({
      where: {
        productId_attribute_value: {
          productId: v.productId,
          attribute: v.attribute,
          value: v.value,
        },
      },
      update: { extraPrice: v.extraPrice, isActive: true },
      create: v,
    });
  }
  console.log("✔ Product variants seeded");

  // ==========================================================================
  // 8. Price Lists & Price List Items (PDF §4-A2)
  // ==========================================================================
  const stdPriceList = await prisma.priceList.upsert({
    where: { name: "Standard Commercial INR" },
    update: { isActive: true },
    create: {
      name: "Standard Commercial INR",
      currency: "INR",
      isActive: true,
    },
  });

  for (const p of Object.values(products)) {
    await prisma.priceListItem.upsert({
      where: {
        priceListId_productId: {
          priceListId: stdPriceList.id,
          productId: p.id,
        },
      },
      update: { price: p.basePrice },
      create: {
        priceListId: stdPriceList.id,
        productId: p.id,
        price: p.basePrice,
      },
    });
  }
  console.log("✔ Price lists seeded");

  // ==========================================================================
  // 9. Warehouses & Physical Inventory (§9 steps 1 and 5)
  // ==========================================================================
  const warehousesData = [
    {
      code: "WH-MAIN",
      name: "Main Central DC",
      address: "Plot 12, Industrial Area, Whitefield, Bengaluru",
      shippingWeight: 1.0, // Preferred warehouse
    },
    {
      code: "WH-EAST",
      name: "East Regional Hub",
      address: "Sector 5, Salt Lake, Kolkata",
      shippingWeight: 1.8,
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
  console.log("✔ Warehouses seeded (WH-MAIN, WH-EAST)");

  // Critical stock arrangement:
  // HW-LAPTOP-15: Main=5, East=9 (ensures 12-unit order forces a multi-warehouse split)
  // HW-SERVER-2U: East=4
  // HW-DESKTOP-ULTRA: Main=8, East=3 (has 3 Main + 1 East reserved for Demo Order 105)
  const inventoryData = [
    { sku: "HW-LAPTOP-15", code: "WH-MAIN", availableQty: 5, reservedQty: 0, reorderLevel: 3 },
    { sku: "HW-LAPTOP-15", code: "WH-EAST", availableQty: 9, reservedQty: 0, reorderLevel: 3 },
    { sku: "HW-SERVER-2U", code: "WH-MAIN", availableQty: 0, reservedQty: 0, reorderLevel: 2 },
    { sku: "HW-SERVER-2U", code: "WH-EAST", availableQty: 4, reservedQty: 0, reorderLevel: 2 },
    { sku: "HW-DESKTOP-ULTRA", code: "WH-MAIN", availableQty: 8, reservedQty: 3, reorderLevel: 2 },
    { sku: "HW-DESKTOP-ULTRA", code: "WH-EAST", availableQty: 3, reservedQty: 1, reorderLevel: 1 },
  ];

  for (const inv of inventoryData) {
    const productId = products[inv.sku].id;
    const warehouseId = warehouses[inv.code].id;

    await prisma.inventory.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      update: {
        availableQty: inv.availableQty,
        reservedQty: inv.reservedQty,
        reorderLevel: inv.reorderLevel,
      },
      create: {
        warehouseId,
        productId,
        availableQty: inv.availableQty,
        reservedQty: inv.reservedQty,
        reorderLevel: inv.reorderLevel,
      },
    });
  }
  console.log("✔ Inventory seeded (laptop stock engineered to force two-warehouse split)");

  // ==========================================================================
  // 10. Subscription Plans (§9 steps 1 and 6)
  // ==========================================================================
  const plansData = [
    {
      sku: "SUB-CLOUD-ENT",
      name: "Cloud Enterprise — Monthly",
      billingInterval: "MONTHLY",
      price: 60.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SUB-CLOUD-ENT",
      name: "Cloud Enterprise — Quarterly",
      billingInterval: "QUARTERLY",
      price: 170.0,
      prorationEnabled: true,
      cancellationRefundPercent: 50.0,
    },
    {
      sku: "SUB-CLOUD-ENT",
      name: "Cloud Enterprise — Yearly",
      billingInterval: "YEARLY",
      price: 640.0,
      prorationEnabled: true,
      cancellationRefundPercent: 75.0,
    },
    {
      sku: "SUB-BACKUP-PRO",
      name: "Cloud Backup — Monthly",
      billingInterval: "MONTHLY",
      price: 40.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SUB-BACKUP-PRO",
      name: "Cloud Backup — Yearly",
      billingInterval: "YEARLY",
      price: 420.0,
      prorationEnabled: true,
      cancellationRefundPercent: 80.0,
    },
    {
      sku: "SUB-CRM-PRO",
      name: "CRM Pro — Monthly",
      billingInterval: "MONTHLY",
      price: 45.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SUB-CRM-PRO",
      name: "CRM Pro — Yearly",
      billingInterval: "YEARLY",
      price: 480.0,
      prorationEnabled: true,
      cancellationRefundPercent: 70.0,
    },
    {
      sku: "SUB-SECURITY-SHIELD",
      name: "Endpoint Security — Monthly",
      billingInterval: "MONTHLY",
      price: 25.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SUB-SECURITY-SHIELD",
      name: "Endpoint Security — Yearly",
      billingInterval: "YEARLY",
      price: 260.0,
      prorationEnabled: true,
      cancellationRefundPercent: 75.0,
    },
  ];

  const subscriptionPlans = {};
  for (const plan of plansData) {
    const productId = products[plan.sku].id;
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { productId, name: plan.name },
    });

    if (existing) {
      subscriptionPlans[plan.name] = await prisma.subscriptionPlan.update({
        where: { id: existing.id },
        data: {
          billingInterval: plan.billingInterval,
          price: plan.price,
          prorationEnabled: plan.prorationEnabled,
          cancellationRefundPercent: plan.cancellationRefundPercent,
          isActive: true,
        },
      });
    } else {
      subscriptionPlans[plan.name] = await prisma.subscriptionPlan.create({
        data: {
          productId,
          name: plan.name,
          billingInterval: plan.billingInterval,
          price: plan.price,
          prorationEnabled: plan.prorationEnabled,
          cancellationRefundPercent: plan.cancellationRefundPercent,
          isActive: true,
        },
      });
    }
  }
  console.log("✔ Subscription plans seeded (Monthly, Quarterly, Yearly with proration)");

  // ==========================================================================
  // 11. Co-Purchase (Upsell) Pairing Rules (PDF §4-A6)
  // ==========================================================================
  const coPurchaseData = [
    { source: "HW-LAPTOP-15", suggested: "SRV-SETUP-01", coPurchaseCount: 48, weight: 1.5, minMarginPercent: 10.0 },
    { source: "HW-LAPTOP-15", suggested: "SUB-CLOUD-ENT", coPurchaseCount: 35, weight: 1.2, minMarginPercent: 20.0 },
    { source: "HW-SERVER-2U", suggested: "SRV-CONSULT-01", coPurchaseCount: 27, weight: 1.4, minMarginPercent: 10.0 },
    { source: "HW-SERVER-2U", suggested: "SRV-SETUP-01", coPurchaseCount: 19, weight: 1.0, minMarginPercent: 10.0 },
    { source: "SRV-CONSULT-01", suggested: "SUB-CLOUD-ENT", coPurchaseCount: 12, weight: 0.9, minMarginPercent: 20.0 },
    { source: "HW-DESKTOP-ULTRA", suggested: "SUB-BACKUP-PRO", coPurchaseCount: 22, weight: 1.3, minMarginPercent: 15.0 },
  ];

  for (const cp of coPurchaseData) {
    const sourceProductId = products[cp.source].id;
    const suggestedProductId = products[cp.suggested].id;

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
  console.log("✔ Co-purchase (upsell) pairing rules seeded");

  // ==========================================================================
  // 12. Category Discount Ceilings (DiscountRules matching PDF §10)
  // ==========================================================================
  const discountRulesData = [
    // GOLD
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
      customerTierId: tiers["GOLD"].id,
      categoryId: categories["SaaS Subscriptions"].id,
      maxDiscountPercent: 25.0,
      minMarginPercent: 30.0,
    },
    // SILVER
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
      customerTierId: tiers["SILVER"].id,
      categoryId: categories["SaaS Subscriptions"].id,
      maxDiscountPercent: 15.0,
      minMarginPercent: 30.0,
    },
    // BRONZE
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
    {
      customerTierId: tiers["BRONZE"].id,
      categoryId: categories["SaaS Subscriptions"].id,
      maxDiscountPercent: 10.0,
      minMarginPercent: 30.0,
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
  console.log("✔ Category discount rules seeded across all tiers");

  // ==========================================================================
  // 13. Default Approval Policy & Multi-level Ladder
  // ==========================================================================
  const defaultPolicy = await prisma.approvalPolicy.upsert({
    where: { name: "Standard Approval Ladder" },
    update: { isActive: true },
    create: {
      name: "Standard Approval Ladder",
      isActive: true,
    },
  });

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
  console.log("✔ Approval policy ladder seeded (Step 1: Manager @ 2/5, Step 2: Finance @ 6/12)");

  // ==========================================================================
  // 14. Demo Customers (Across All Tiers with Portal Access)
  // ==========================================================================
  const customersData = [
    {
      name: "Acme Global Industries",
      contactEmail: "john@acmeglobal.com",
      phone: "+91 98765 43210",
      billingAddress: "Tech Park, Whitefield, Bengaluru, Karnataka 560066",
      customerTierId: tiers["GOLD"].id,
      ownerRepId: users["rep@dealflow360.com"].id,
    },
    {
      name: "Nexus Retail Solutions",
      contactEmail: "sarah@nexusretail.com",
      phone: "+91 98765 11223",
      billingAddress: "Cyber City, DLF Phase 2, Gurugram, Haryana 122002",
      customerTierId: tiers["SILVER"].id,
      ownerRepId: users["rep@dealflow360.com"].id,
    },
    {
      name: "Starlight Digital Studio",
      contactEmail: "contact@starlight.io",
      phone: "+91 98765 99887",
      billingAddress: "Bandra Kurla Complex, Bandra East, Mumbai 400051",
      customerTierId: tiers["BRONZE"].id,
      ownerRepId: users["rep@dealflow360.com"].id,
    },
    {
      name: "Zenith FinTech Labs",
      contactEmail: "procurement@zenithfintech.com",
      phone: "+91 98765 55443",
      billingAddress: "Financial District, Nanakramguda, Hyderabad 500032",
      customerTierId: tiers["GOLD"].id,
      ownerRepId: users["priya@dealflow360.com"].id,
    },
    {
      name: "Vanguard Logistics Corp",
      contactEmail: "ops@vanguardlogistics.in",
      phone: "+91 98765 77665",
      billingAddress: "MIDC Industrial Estate, Chakan, Pune, Maharashtra 410501",
      customerTierId: tiers["SILVER"].id,
      ownerRepId: users["priya@dealflow360.com"].id,
    },
  ];

  const customers = {};
  for (const c of customersData) {
    customers[c.contactEmail] = await prisma.customer.upsert({
      where: { contactEmail: c.contactEmail },
      update: c,
      create: c,
    });
  }
  console.log("✔ Customers seeded across all tiers");

  // ==========================================================================
  // 15. Idempotent Clean-up of Previous Demo Transactions (QTN-DEMO-*)
  // ==========================================================================
  console.log("\nRefreshing demo quotation and order lifecycle fixtures...");
  const oldDemoQuotes = await prisma.quotation.findMany({
    where: { quotationNumber: { startsWith: "QTN-DEMO-" } },
    select: { id: true },
  });
  const demoQuoteIds = oldDemoQuotes.map((q) => q.id);

  if (demoQuoteIds.length > 0) {
    const oldOrders = await prisma.order.findMany({
      where: { quotationId: { in: demoQuoteIds } },
      select: { id: true },
    });
    const orderIds = oldOrders.map((o) => o.id);

    if (orderIds.length > 0) {
      const oldInvoices = await prisma.invoice.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      });
      const invoiceIds = oldInvoices.map((i) => i.id);

      if (invoiceIds.length > 0) {
        await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await prisma.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }

      const oldSubs = await prisma.subscription.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      });
      const subIds = oldSubs.map((s) => s.id);
      if (subIds.length > 0) {
        await prisma.billingSchedule.deleteMany({ where: { subscriptionId: { in: subIds } } });
        await prisma.subscription.deleteMany({ where: { id: { in: subIds } } });
      }

      await prisma.fulfillmentAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }

    const oldApprovals = await prisma.quotationApproval.findMany({
      where: { quotationId: { in: demoQuoteIds } },
      select: { id: true },
    });
    const approvalIds = oldApprovals.map((a) => a.id);
    if (approvalIds.length > 0) {
      await prisma.quotationApprovalStep.deleteMany({ where: { quotationApprovalId: { in: approvalIds } } });
      await prisma.quotationApproval.deleteMany({ where: { id: { in: approvalIds } } });
    }

    const oldNegs = await prisma.negotiation.findMany({
      where: { quotationId: { in: demoQuoteIds } },
      select: { id: true },
    });
    const negIds = oldNegs.map((n) => n.id);
    if (negIds.length > 0) {
      await prisma.negotiationRequest.deleteMany({ where: { negotiationId: { in: negIds } } });
      await prisma.negotiation.deleteMany({ where: { id: { in: negIds } } });
    }

    await prisma.dealHealthSignal.deleteMany({ where: { quotationId: { in: demoQuoteIds } } });
    await prisma.portalToken.deleteMany({ where: { quotationId: { in: demoQuoteIds } } });
    await prisma.auditLog.deleteMany({ where: { quotationId: { in: demoQuoteIds } } });
    await prisma.quotationLine.deleteMany({ where: { quotationId: { in: demoQuoteIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: demoQuoteIds } } });
  }

  // Helper function to create mathematically exact quotation line snapshots
  function buildLineSnapshot({
    productId,
    quantity,
    discountPercent,
    effectiveCeilingPercent,
    minMarginPercent = 0,
    subscriptionPlanId = null,
    lineType = "ONE_TIME",
    addedViaUpsell = false,
    position = 0,
  }) {
    const product = Object.values(products).find((p) => p.id === productId);
    const unitPrice = toNum(product.basePrice);
    const unitCost = toNum(product.costPrice);
    const math = calculateLineMath({
      quantity,
      unitPrice,
      unitCost,
      discountPercent,
    });

    const overagePts = Math.max(0, round2(discountPercent - effectiveCeilingPercent));
    const taxAmount = round2((math.lineTotal * toNum(product.taxRate)) / 100);
    const lineTotalWithTax = round2(math.lineTotal + taxAmount);

    return {
      productId,
      subscriptionPlanId,
      lineType,
      quantity,
      unitPrice,
      unitCost,
      effectiveCeilingPercent,
      minMarginPercent,
      discountPercent,
      taxRate: toNum(product.taxRate),
      overagePts,
      lineTotal: lineTotalWithTax,
      lineMarginPercent: math.marginPercent,
      addedViaUpsell,
      position,
      // internal helper fields for parent totals
      _math: math,
      _taxAmount: taxAmount,
      _productName: product.name,
    };
  }

  function computeQuoteTotals(lines) {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    let costTotal = 0;
    let totalBaseValue = 0;
    let totalWeightedOverage = 0;
    let worstLineOverage = 0;

    for (const l of lines) {
      subtotal = round2(subtotal + l._math.grossTotal);
      discountTotal = round2(discountTotal + l._math.discountAmount);
      taxTotal = round2(taxTotal + l._taxAmount);
      costTotal = round2(costTotal + l._math.totalCost);

      const baseVal = l._math.grossTotal;
      totalBaseValue += baseVal;
      totalWeightedOverage += l.overagePts * baseVal;

      if (l.overagePts > worstLineOverage) {
        worstLineOverage = l.overagePts;
      }
    }

    const grandTotal = round2(subtotal - discountTotal + taxTotal);
    const marginAmount = round2(subtotal - discountTotal - costTotal);
    const netRevenue = subtotal - discountTotal;
    const marginPercent = netRevenue > 0 ? round2((marginAmount / netRevenue) * 100) : 0;
    const blendedScore = totalBaseValue > 0 ? round2(totalWeightedOverage / totalBaseValue) : 0;

    return {
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      marginAmount,
      marginPercent,
      blendedScore,
      worstLineOverage,
    };
  }

  // ==========================================================================
  // 16. Consistent Dummy Quotations Spanning All Lifecycle Stages
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 16.1. Deal 1: QTN-DEMO-101 — Clean Draft Quote (Auto-approvable, No Overage)
  // --------------------------------------------------------------------------
  const zenithCustomer = customers["procurement@zenithfintech.com"];
  const lines101Raw = [
    buildLineSnapshot({
      productId: products["HW-LAPTOP-15"].id,
      quantity: 5,
      discountPercent: 10.0, // Within Gold 15% ceiling
      effectiveCeilingPercent: 15.0,
      minMarginPercent: 20.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SRV-SETUP-01"].id,
      quantity: 2,
      discountPercent: 5.0, // Within Gold 10% ceiling
      effectiveCeilingPercent: 10.0,
      minMarginPercent: 15.0,
      position: 1,
      addedViaUpsell: true,
    }),
  ];
  const totals101 = computeQuoteTotals(lines101Raw);

  await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-DEMO-101",
      customerId: zenithCustomer.id,
      salesRepId: users["priya@dealflow360.com"].id,
      customerTierId: zenithCustomer.customerTierId,
      status: "DRAFT",
      version: 1,
      ...totals101,
      marginFloorBreached: false,
      lastActivityAt: new Date(),
      lines: {
        create: lines101Raw.map(({ _math, _taxAmount, _productName, ...line }) => line),
      },
    },
  });
  console.log("  ✔ Seeded Deal 1: QTN-DEMO-101 (DRAFT, Clean, Blended 0, Worst 0)");

  // --------------------------------------------------------------------------
  // 16.2. Deal 2: QTN-DEMO-102 — Single-Line Overage (Pending Manager Approval)
  // PDF §10 Hero Example: Laptop 12% (within 15%), Setup 18% (8 pts over 10%)
  // --------------------------------------------------------------------------
  const acmeCustomer = customers["john@acmeglobal.com"];
  const lines102Raw = [
    buildLineSnapshot({
      productId: products["HW-LAPTOP-15"].id,
      quantity: 10,
      discountPercent: 12.0, // Ceiling 15% -> 0 overage
      effectiveCeilingPercent: 15.0,
      minMarginPercent: 20.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SRV-SETUP-01"].id,
      quantity: 1,
      discountPercent: 18.0, // Ceiling 10% -> 8 overage
      effectiveCeilingPercent: 10.0,
      minMarginPercent: 15.0,
      position: 1,
      addedViaUpsell: true,
    }),
  ];
  const totals102 = computeQuoteTotals(lines102Raw);

  const quote102 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-DEMO-102",
      customerId: acmeCustomer.id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: acmeCustomer.customerTierId,
      status: "PENDING_APPROVAL",
      version: 1,
      ...totals102,
      marginFloorBreached: false,
      lastActivityAt: new Date(),
      lines: {
        create: lines102Raw.map(({ _math, _taxAmount, _productName, ...line }) => line),
      },
    },
    include: { lines: true },
  });

  // Populate Manager Approval Queue with per-line findings
  const findings102 = quote102.lines.map((l) => {
    const raw = lines102Raw.find((r) => r.productId === l.productId);
    return {
      lineId: l.id,
      productName: raw._productName,
      discountPercent: toNum(l.discountPercent),
      ceilingPercent: toNum(l.effectiveCeilingPercent),
      overagePts: toNum(l.overagePts),
      marginPercent: toNum(l.lineMarginPercent),
    };
  });

  const approval102 = await prisma.quotationApproval.create({
    data: {
      quotationId: quote102.id,
      approvalPolicyId: defaultPolicy.id,
      approvalCycle: 1,
      status: "PENDING",
      blendedScore: totals102.blendedScore,
      worstLineOverage: totals102.worstLineOverage,
      findings: findings102,
      triggeredBy: "REP_SUBMIT",
      startedAt: new Date(),
    },
  });

  await prisma.quotationApprovalStep.create({
    data: {
      quotationApprovalId: approval102.id,
      roleId: roles["SALES_MANAGER"].id,
      stepOrder: 1,
      status: "PENDING",
    },
  });
  console.log("  ✔ Seeded Deal 2: QTN-DEMO-102 (PENDING_APPROVAL, Manager Queue, Worst=8.00)");

  // --------------------------------------------------------------------------
  // 16.3. Deal 3: QTN-DEMO-103 — Severe Overage (Step 1 Approved -> Step 2 Finance Pending)
  // Vanguard Logistics (Silver): Laptops 25% (over 10%), Consulting 15% (over 5%)
  // --------------------------------------------------------------------------
  const vanguardCustomer = customers["ops@vanguardlogistics.in"];
  const lines103Raw = [
    buildLineSnapshot({
      productId: products["HW-LAPTOP-15"].id,
      quantity: 6,
      discountPercent: 25.0, // Silver ceiling 10% -> 15 overage
      effectiveCeilingPercent: 10.0,
      minMarginPercent: 20.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SRV-CONSULT-01"].id,
      quantity: 3,
      discountPercent: 15.0, // Silver ceiling 5% -> 10 overage
      effectiveCeilingPercent: 5.0,
      minMarginPercent: 15.0,
      position: 1,
    }),
  ];
  const totals103 = computeQuoteTotals(lines103Raw);

  const quote103 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-DEMO-103",
      customerId: vanguardCustomer.id,
      salesRepId: users["priya@dealflow360.com"].id,
      customerTierId: vanguardCustomer.customerTierId,
      status: "PENDING_APPROVAL",
      version: 1,
      ...totals103,
      marginFloorBreached: true,
      lastActivityAt: new Date(),
      lines: {
        create: lines103Raw.map(({ _math, _taxAmount, _productName, ...line }) => line),
      },
    },
    include: { lines: true },
  });

  const findings103 = quote103.lines.map((l) => {
    const raw = lines103Raw.find((r) => r.productId === l.productId);
    return {
      lineId: l.id,
      productName: raw._productName,
      discountPercent: toNum(l.discountPercent),
      ceilingPercent: toNum(l.effectiveCeilingPercent),
      overagePts: toNum(l.overagePts),
      marginPercent: toNum(l.lineMarginPercent),
    };
  });

  const approval103 = await prisma.quotationApproval.create({
    data: {
      quotationId: quote103.id,
      approvalPolicyId: defaultPolicy.id,
      approvalCycle: 1,
      status: "PENDING",
      blendedScore: totals103.blendedScore,
      worstLineOverage: totals103.worstLineOverage,
      findings: findings103,
      triggeredBy: "REP_SUBMIT",
      startedAt: new Date(Date.now() - 3600 * 1000 * 4),
    },
  });

  // Step 1: Manager already approved
  await prisma.quotationApprovalStep.create({
    data: {
      quotationApprovalId: approval103.id,
      roleId: roles["SALES_MANAGER"].id,
      reviewerId: users["manager@dealflow360.com"].id,
      stepOrder: 1,
      status: "APPROVED",
      reason: "Strategic fleet expansion deal with Vanguard Logistics. Approved from sales perspective; escalated to Finance for margin approval.",
      actedAt: new Date(Date.now() - 3600 * 1000 * 2),
    },
  });

  // Step 2: Finance currently pending
  await prisma.quotationApprovalStep.create({
    data: {
      quotationApprovalId: approval103.id,
      roleId: roles["FINANCE"].id,
      stepOrder: 2,
      status: "PENDING",
    },
  });
  console.log("  ✔ Seeded Deal 3: QTN-DEMO-103 (PENDING_APPROVAL, Finance Queue Step 2, Worst=15.00)");

  // --------------------------------------------------------------------------
  // 16.4. Deal 4: QTN-DEMO-104 — Customer Negotiation Session with Portal Token
  // --------------------------------------------------------------------------
  const nexusCustomer = customers["sarah@nexusretail.com"];
  const lines104Raw = [
    buildLineSnapshot({
      productId: products["HW-SERVER-2U"].id,
      quantity: 2,
      discountPercent: 8.0, // Within Silver 10% ceiling
      effectiveCeilingPercent: 10.0,
      minMarginPercent: 20.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SUB-CLOUD-ENT"].id,
      subscriptionPlanId: subscriptionPlans["Cloud Enterprise — Monthly"].id,
      lineType: "RECURRING",
      quantity: 10,
      discountPercent: 10.0, // Within Silver 15% ceiling
      effectiveCeilingPercent: 15.0,
      minMarginPercent: 30.0,
      position: 1,
      addedViaUpsell: true,
    }),
  ];
  const totals104 = computeQuoteTotals(lines104Raw);

  const quote104 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-DEMO-104",
      customerId: nexusCustomer.id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: nexusCustomer.customerTierId,
      status: "UNDER_NEGOTIATION",
      version: 1,
      ...totals104,
      marginFloorBreached: false,
      sentToCustomerAt: new Date(Date.now() - 3600 * 1000 * 24),
      lastActivityAt: new Date(Date.now() - 3600 * 1000 * 2),
      lines: {
        create: lines104Raw.map(({ _math, _taxAmount, _productName, ...line }) => line),
      },
    },
    include: { lines: true },
  });

  // Create Active Customer Negotiation Session
  const negotiation104 = await prisma.negotiation.create({
    data: {
      quotationId: quote104.id,
      status: "OPEN",
      openedAt: new Date(Date.now() - 3600 * 1000 * 6),
    },
  });

  const serverLine = quote104.lines.find((l) => l.productId === products["HW-SERVER-2U"].id);
  await prisma.negotiationRequest.create({
    data: {
      negotiationId: negotiation104.id,
      quotationLineId: serverLine?.id,
      actorType: "CUSTOMER",
      requestType: "DISCOUNT",
      proposedDiscountPercent: 14.0,
      message: "We are comparing quotes against vendor Dell. Can you match 14% on the server hardware if we commit to an annual cloud agreement?",
      status: "OPEN",
    },
  });

  // Mint a customer portal token for testing magic-link access
  await prisma.portalToken.create({
    data: {
      quotationId: quote104.id,
      token: "demo-portal-nexus-retail-token",
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  console.log("  ✔ Seeded Deal 4: QTN-DEMO-104 (UNDER_NEGOTIATION, Open Customer Ask, Portal Token)");

  // --------------------------------------------------------------------------
  // 16.5. Deal 5: QTN-DEMO-105 — Confirmed Deal with Order, Multi-Warehouse Split,
  // Subscriptions, and Invoicing & Payments (§9 steps 5, 6, 8)
  // --------------------------------------------------------------------------
  const lines105Raw = [
    buildLineSnapshot({
      productId: products["HW-DESKTOP-ULTRA"].id,
      quantity: 4,
      discountPercent: 10.0, // Within Gold 15% ceiling
      effectiveCeilingPercent: 15.0,
      minMarginPercent: 20.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SUB-CLOUD-ENT"].id,
      subscriptionPlanId: subscriptionPlans["Cloud Enterprise — Monthly"].id,
      lineType: "RECURRING",
      quantity: 25,
      discountPercent: 10.0, // Within Gold 25% ceiling
      effectiveCeilingPercent: 25.0,
      minMarginPercent: 30.0,
      position: 1,
      addedViaUpsell: true,
    }),
  ];
  const totals105 = computeQuoteTotals(lines105Raw);

  const quote105 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-DEMO-105",
      customerId: acmeCustomer.id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: acmeCustomer.customerTierId,
      status: "CONFIRMED",
      version: 1,
      ...totals105,
      marginFloorBreached: false,
      confirmedAt: new Date(Date.now() - 3600 * 1000 * 48),
      lastActivityAt: new Date(Date.now() - 3600 * 1000 * 24),
      lines: {
        create: lines105Raw.map(({ _math, _taxAmount, _productName, ...line }) => line),
      },
    },
    include: { lines: true },
  });

  // Confirmed Order
  const order105 = await prisma.order.create({
    data: {
      orderNumber: "ORD-2026-DEMO-001",
      quotationId: quote105.id,
      customerId: acmeCustomer.id,
      status: "ALLOCATED",
      totalAmount: totals105.grandTotal,
      confirmedAt: new Date(Date.now() - 3600 * 1000 * 48),
    },
  });

  const desktopQuoteLine = quote105.lines.find((l) => l.productId === products["HW-DESKTOP-ULTRA"].id);
  const cloudQuoteLine = quote105.lines.find((l) => l.productId === products["SUB-CLOUD-ENT"].id);

  // Order Lines
  const desktopOrderLine = await prisma.orderLine.create({
    data: {
      orderId: order105.id,
      quotationLineId: desktopQuoteLine.id,
      productId: desktopQuoteLine.productId,
      lineType: desktopQuoteLine.lineType,
      quantity: desktopQuoteLine.quantity,
      unitPrice: desktopQuoteLine.unitPrice,
      unitCost: desktopQuoteLine.unitCost,
      discountPercent: desktopQuoteLine.discountPercent,
      taxRate: desktopQuoteLine.taxRate,
      lineTotal: desktopQuoteLine.lineTotal,
    },
  });

  const cloudOrderLine = await prisma.orderLine.create({
    data: {
      orderId: order105.id,
      quotationLineId: cloudQuoteLine.id,
      productId: cloudQuoteLine.productId,
      subscriptionPlanId: cloudQuoteLine.subscriptionPlanId,
      lineType: cloudQuoteLine.lineType,
      quantity: cloudQuoteLine.quantity,
      unitPrice: cloudQuoteLine.unitPrice,
      unitCost: cloudQuoteLine.unitCost,
      discountPercent: cloudQuoteLine.discountPercent,
      taxRate: cloudQuoteLine.taxRate,
      lineTotal: cloudQuoteLine.lineTotal,
    },
  });

  // Multi-Warehouse Split Allocations for 4 Workstations:
  // 3 units from Main (WH-MAIN), 1 unit from East (WH-EAST)
  await prisma.fulfillmentAllocation.create({
    data: {
      orderId: order105.id,
      orderLineId: desktopOrderLine.id,
      warehouseId: warehouses["WH-MAIN"].id,
      allocatedQty: 3,
      fulfilledQty: 3,
      backorderQty: 0,
      shippingCost: 150.0,
      status: "RESERVED",
      isManualOverride: false,
    },
  });

  await prisma.fulfillmentAllocation.create({
    data: {
      orderId: order105.id,
      orderLineId: desktopOrderLine.id,
      warehouseId: warehouses["WH-EAST"].id,
      allocatedQty: 1,
      fulfilledQty: 1,
      backorderQty: 0,
      shippingCost: 270.0,
      status: "RESERVED",
      isManualOverride: false,
    },
  });

  // Active Subscription with 3 Billing Schedules
  const subStart = new Date(Date.now() - 3600 * 1000 * 48);
  const periodEnd1 = new Date(Date.now() + 28 * 24 * 3600 * 1000);
  const subscription105 = await prisma.subscription.create({
    data: {
      orderId: order105.id,
      orderLineId: cloudOrderLine.id,
      customerId: acmeCustomer.id,
      subscriptionPlanId: subscriptionPlans["Cloud Enterprise — Monthly"].id,
      status: "ACTIVE",
      quantity: 25,
      unitPrice: 54.0, // 60 with 10% disc
      startDate: subStart,
      currentPeriodStart: subStart,
      currentPeriodEnd: periodEnd1,
    },
  });

  const sched1 = await prisma.billingSchedule.create({
    data: {
      subscriptionId: subscription105.id,
      billingDate: subStart,
      periodStart: subStart,
      periodEnd: periodEnd1,
      quantity: 25,
      prorationFactor: 1.0,
      amount: 1350.0,
      status: "INVOICED",
    },
  });

  await prisma.billingSchedule.create({
    data: {
      subscriptionId: subscription105.id,
      billingDate: periodEnd1,
      periodStart: periodEnd1,
      periodEnd: new Date(periodEnd1.getTime() + 30 * 24 * 3600 * 1000),
      quantity: 25,
      prorationFactor: 1.0,
      amount: 1350.0,
      status: "SCHEDULED",
    },
  });

  await prisma.billingSchedule.create({
    data: {
      subscriptionId: subscription105.id,
      billingDate: new Date(periodEnd1.getTime() + 30 * 24 * 3600 * 1000),
      periodStart: new Date(periodEnd1.getTime() + 30 * 24 * 3600 * 1000),
      periodEnd: new Date(periodEnd1.getTime() + 60 * 24 * 3600 * 1000),
      quantity: 25,
      prorationFactor: 1.0,
      amount: 1350.0,
      status: "SCHEDULED",
    },
  });

  // Invoice 1: ONE_TIME Hardware (Workstations) — Partially Paid
  const inv1Subtotal = 7920.0; // 4 * 1980
  const inv1Tax = 1425.6; // 18% GST
  const inv1Total = 9345.6;
  const inv1Paid = 5000.0;

  const invoice1 = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0001",
      orderId: order105.id,
      invoiceType: "ONE_TIME",
      status: "PARTIALLY_PAID",
      issueDate: new Date(Date.now() - 3600 * 1000 * 36),
      dueDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      subtotal: inv1Subtotal,
      taxAmount: inv1Tax,
      totalAmount: inv1Total,
      amountPaid: inv1Paid,
      lines: {
        create: [
          {
            orderLineId: desktopOrderLine.id,
            description: "Ultra Workstation Pro (Fleet of 4 Units)",
            quantity: 4,
            unitPrice: 1980.0,
            prorationFactor: 1.0,
            taxAmount: inv1Tax,
            lineTotal: inv1Total,
          },
        ],
      },
    },
  });

  // Recorded Partial Payment against Invoice 1
  await prisma.payment.create({
    data: {
      invoiceId: invoice1.id,
      recordedById: users["finance@dealflow360.com"].id,
      amount: inv1Paid,
      paymentMethod: "BANK_TRANSFER",
      transactionReference: "HDFC-NEFT-9028471",
      paidAt: new Date(Date.now() - 3600 * 1000 * 24),
    },
  });

  // Invoice 2: RECURRING SaaS (Period 1) — Posted
  const inv2Subtotal = 1350.0;
  const inv2Tax = 243.0;
  const inv2Total = 1593.0;

  await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0002",
      orderId: order105.id,
      billingScheduleId: sched1.id,
      invoiceType: "RECURRING",
      status: "POSTED",
      issueDate: new Date(Date.now() - 3600 * 1000 * 36),
      dueDate: new Date(Date.now() + 10 * 24 * 3600 * 1000),
      subtotal: inv2Subtotal,
      taxAmount: inv2Tax,
      totalAmount: inv2Total,
      amountPaid: 0.0,
      lines: {
        create: [
          {
            orderLineId: cloudOrderLine.id,
            description: "DealFlow Cloud Enterprise (25 Seats - Month 1)",
            quantity: 25,
            unitPrice: 54.0,
            prorationFactor: 1.0,
            taxAmount: inv2Tax,
            lineTotal: inv2Total,
          },
        ],
      },
    },
  });
  console.log("  ✔ Seeded Deal 5: QTN-DEMO-105 (CONFIRMED, Multi-Warehouse Split, Subscriptions, Invoices & Partial Payment)");

  // --------------------------------------------------------------------------
  // 16.6. Deal 6: QTN-DEMO-106 — Stalled Deal with Active DealHealthSignal
  // --------------------------------------------------------------------------
  const starlightCustomer = customers["contact@starlight.io"];
  const lines106Raw = [
    buildLineSnapshot({
      productId: products["HW-LAPTOP-15"].id,
      quantity: 1,
      discountPercent: 4.0, // Within Bronze 5% ceiling
      effectiveCeilingPercent: 5.0,
      minMarginPercent: 20.0,
      position: 0,
    }),
  ];
  const totals106 = computeQuoteTotals(lines106Raw);

  const quote106 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-DEMO-106",
      customerId: starlightCustomer.id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: starlightCustomer.customerTierId,
      status: "SENT",
      version: 1,
      ...totals106,
      marginFloorBreached: false,
      sentToCustomerAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
      lastActivityAt: new Date(Date.now() - 11 * 24 * 3600 * 1000), // > 7 days ago
      lines: {
        create: lines106Raw.map(({ _math, _taxAmount, _productName, ...line }) => line),
      },
    },
  });

  await prisma.dealHealthSignal.create({
    data: {
      quotationId: quote106.id,
      signalType: "STALLED_DEAL",
      severity: "HIGH",
      score: 85.0,
      message: "Quotation QTN-DEMO-106 has remained inactive for 11 days, exceeding the 7-day governance threshold.",
      detectedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000),
    },
  });
  console.log("  ✔ Seeded Deal 6: QTN-DEMO-106 (SENT, Stalled Deal Alert, Health Signal)");

  // ==========================================================================
  // 17. Seed Append-Only Audit Trail Records
  // ==========================================================================
  await prisma.auditLog.createMany({
    data: [
      {
        userId: users["admin@dealflow360.com"].id,
        actorType: "USER",
        entityType: "GovernanceSetting",
        entityId: "singleton",
        action: "GOVERNANCE_CONFIG_INITIALIZED",
        newValue: { scoreStrategy: "VALUE_WEIGHTED", unconfiguredCeilingPolicy: "DENY" },
        reason: "Initial deployment baseline governance configuration",
      },
      {
        userId: users["rep@dealflow360.com"].id,
        quotationId: quote102.id,
        actorType: "USER",
        entityType: "Quotation",
        entityId: quote102.id,
        action: "QUOTATION_SUBMITTED_FOR_APPROVAL",
        newValue: { status: "PENDING_APPROVAL", worstLineOverage: 8.0, blendedScore: 1.33 },
        reason: "Sales Rep submitted quote with line overage on setup service",
      },
      {
        userId: users["manager@dealflow360.com"].id,
        quotationId: quote103.id,
        actorType: "USER",
        entityType: "QuotationApprovalStep",
        entityId: approval103.id,
        action: "APPROVAL_STEP_APPROVED",
        newValue: { stepOrder: 1, status: "APPROVED" },
        reason: "Manager approved step 1 exception and forwarded to Finance",
      },
      {
        userId: users["finance@dealflow360.com"].id,
        quotationId: quote105.id,
        actorType: "USER",
        entityType: "Payment",
        entityId: invoice1.id,
        action: "PAYMENT_RECORDED",
        newValue: { amount: 5000.0, method: "BANK_TRANSFER", status: "PARTIALLY_PAID" },
        reason: "Received partial advance bank transfer for hardware procurement",
      },
    ],
  });
  console.log("✔ Audit trail logs seeded");

  console.log("\n======================================================================");
  console.log("🎉 SEEDING COMPLETED SUCCESSFULLY!");
  console.log("======================================================================\n");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
