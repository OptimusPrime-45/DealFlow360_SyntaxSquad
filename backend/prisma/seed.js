import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateLineMath, round2, toNum } from "../lib/money.js";

const prisma = new PrismaClient();

async function main() {
  console.log("\n======================================================================");
  console.log(" DEALFLOW360 — COMPREHENSIVE SEED SCRIPT (CLEAN DATABASE & FRESH PIPELINE)");
  console.log("======================================================================\n");

  // ==========================================================================
  // 0. CLEAR ENTIRE DATABASE (Idempotent complete wipe)
  // ==========================================================================
  console.log("Purging all existing database records across all tables...");
  const deleteOps = [
    prisma.auditLog.deleteMany(),
    prisma.dealHealthSignal.deleteMany(),
    prisma.creditNote.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.billingSchedule.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.fulfillmentAllocation.deleteMany(),
    prisma.orderLine.deleteMany(),
    prisma.order.deleteMany(),
    prisma.negotiationRequest.deleteMany(),
    prisma.negotiation.deleteMany(),
    prisma.quotationApprovalStep.deleteMany(),
    prisma.quotationApproval.deleteMany(),
    prisma.quotationLine.deleteMany(),
    prisma.portalToken.deleteMany(),
    prisma.quotation.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.warehouseShippingWeight.deleteMany(),
    prisma.warehouse.deleteMany(),
    prisma.coPurchaseRule.deleteMany(),
    prisma.subscriptionPlan.deleteMany(),
    prisma.priceListItem.deleteMany(),
    prisma.priceList.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.productCategory.deleteMany(),
    prisma.approvalPolicyStep.deleteMany(),
    prisma.approvalPolicy.deleteMany(),
    prisma.discountRule.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.customerTier.deleteMany(),
    prisma.user.deleteMany(),
    prisma.role.deleteMany(),
    prisma.governanceSetting.deleteMany(),
  ];

  for (const op of deleteOps) {
    await op;
  }
  console.log("✔ Database cleared cleanly (0 records remaining)\n");

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
    roles[r.code] = await prisma.role.create({ data: r });
  }
  console.log("✔ Roles seeded (ADMIN, SALES_REP, SALES_MANAGER, FINANCE)");

  // ==========================================================================
  // 2. Demo Users for Each Role (Password: Password123!)
  // ==========================================================================
  const defaultPasswordHash = await bcrypt.hash("Password123!", 10);
  const demoUsers = [
    {
      email: "admin@dealflow360.com",
      fullName: "Vikramaditya Singhania",
      roleCode: "ADMIN",
    },
    {
      email: "rep@dealflow360.com",
      fullName: "Aarav Mehta",
      roleCode: "SALES_REP",
    },
    {
      email: "priya@dealflow360.com",
      fullName: "Ananya Sen",
      roleCode: "SALES_REP",
    },
    {
      email: "rep.test@dealflow360.internal",
      fullName: "Kabir Das",
      roleCode: "SALES_REP",
    },
    {
      email: "manager@dealflow360.com",
      fullName: "Rohan Roy Verma",
      roleCode: "SALES_MANAGER",
    },
    {
      email: "finance@dealflow360.com",
      fullName: "Meera Sundaram",
      roleCode: "FINANCE",
    },
  ];

  const users = {};
  for (const u of demoUsers) {
    users[u.email] = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash: defaultPasswordHash,
        fullName: u.fullName,
        roleId: roles[u.roleCode].id,
        isActive: true,
      },
    });
    if (!users[u.roleCode]) {
      users[u.roleCode] = users[u.email];
    }
  }
  console.log("✔ Demo corporate users seeded (Password: Password123!)");

  // ==========================================================================
  // 3. Singleton Governance Settings
  // ==========================================================================
  await prisma.governanceSetting.create({
    data: {
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
    { code: "BRONZE", name: "Bronze Standard Tier", rank: 1, maxDiscountPercent: 5.0 },
    { code: "SILVER", name: "Silver Preferred Tier", rank: 2, maxDiscountPercent: 10.0 },
    { code: "GOLD", name: "Gold Enterprise Tier", rank: 3, maxDiscountPercent: 15.0 },
  ];

  const tiers = {};
  for (const t of tiersData) {
    tiers[t.code] = await prisma.customerTier.create({ data: t });
  }
  console.log("✔ Customer tiers seeded (BRONZE 5%, SILVER 10%, GOLD 15%)");

  // ==========================================================================
  // 5. Product Categories
  // ==========================================================================
  const categoriesData = [
    {
      name: "Hardware",
      description: "High-performance enterprise laptops, compute nodes, and network gear [TYPE:ONE_TIME]",
    },
    {
      name: "Professional Services",
      description: "Deployment, security architecture consulting, and SLA services [TYPE:SERVICE]",
    },
    {
      name: "SaaS Subscriptions",
      description: "Recurring cloud platform plans, backup licenses, and zero-trust seats [TYPE:SUBSCRIPTION]",
    },
  ];

  const categories = {};
  for (const c of categoriesData) {
    categories[c.name] = await prisma.productCategory.create({ data: c });
  }
  console.log("✔ Product categories seeded (Hardware, Professional Services, SaaS Subscriptions)");

  // ==========================================================================
  // 6. Products Catalog
  // ==========================================================================
  const productsData = [
    // Hardware
    {
      sku: "HW-LAPTOP-15",
      name: "QuantumBook Pro 15 Enterprise",
      description: "Flagship corporate laptop (Intel Core Ultra 7, 32GB RAM, 1TB NVMe, AI Coprocessor)",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 1000.0,
      costPrice: 700.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "PRO-LAPTOP-01",
      name: "ThinkStation UltraBook 16",
      description: "Executive workstation laptop (Intel Xeon, 64GB ECC, RTX 4000 Ada)",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 120000.0,
      costPrice: 85000.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "PROD-LAPTOP-01",
      name: "Latitude Enterprise Ultrabook",
      description: "Compact enterprise ultrabook (16GB RAM, 512GB SSD, vPro)",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 1000.0,
      costPrice: 700.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "HW-DESKTOP-ULTRA",
      name: "Titan Workstation Pro Max",
      description: "Heavy-duty engineering workstation (AMD Threadripper 64-Core, 128GB RAM, Liquid Cooled)",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 2200.0,
      costPrice: 1550.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "PRO-WORKSTATION-01",
      name: "Apex Studio Workstation Tower",
      description: "Visual computing & AI render tower workstation",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 150000.0,
      costPrice: 100000.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "HW-SERVER-2U",
      name: "PowerEdge Enterprise Server Node 2U",
      description: "Dual AMD EPYC 9654, 512GB DDR5 ECC, 8x NVMe U.2 Enterprise SSDs",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 4500.0,
      costPrice: 3200.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "PRO-SERVER-RACK-01",
      name: "HyperCluster Server Node 2U",
      description: "High-density cloud virtualization compute node",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 200000.0,
      costPrice: 140000.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "HW-MONITOR-27",
      name: "UltraVision 4K Studio Display 27\"",
      description: "Calibrated IPS Black 4K panel, 98% DCI-P3, USB-C 90W Power Delivery",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 450.0,
      costPrice: 310.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "HW-ROUTER-MESH",
      name: "CyberShield Enterprise WiFi-6 Mesh",
      description: "Zero-Trust AX6000 Tri-Band Mesh Security Gateway with Hardware VPN",
      categoryId: categories["Hardware"].id,
      productType: "ONE_TIME",
      basePrice: 350.0,
      costPrice: 220.0,
      taxRate: 18.0,
      isPromoted: false,
    },

    // Professional Services
    {
      sku: "SRV-SETUP-01",
      name: "Rapid Deployment & Onsite Setup SLA",
      description: "White-glove unboxing, OS imaging, zero-touch provisioning, and domain join",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 200.0,
      costPrice: 160.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "PROD-SETUP-01",
      name: "Turnkey Implementation & Rollout",
      description: "Turnkey enterprise setup and initial infrastructure validation",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 200.0,
      costPrice: 120.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "SRV-CONSULT-01",
      name: "Enterprise Architecture Consulting",
      description: "Senior solutions architect advisory, disaster recovery review, and cloud migration",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 500.0,
      costPrice: 380.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "SRV-SUPPORT-247",
      name: "24/7 Dedicated IT Support SLA",
      description: "24/7 round-the-clock priority engineer hotline, 15-min SLA response guarantee",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 800.0,
      costPrice: 520.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SRV-MAINT-FLEET",
      name: "Hardware Preventive Maintenance",
      description: "Quarterly onsite thermal cleaning, firmware patching, and diagnostic health check",
      categoryId: categories["Professional Services"].id,
      productType: "SERVICE",
      basePrice: 350.0,
      costPrice: 210.0,
      taxRate: 18.0,
      isPromoted: false,
    },

    // SaaS Subscriptions
    {
      sku: "SUB-CLOUD-ENT",
      name: "AetherCloud Enterprise Platform",
      description: "Unified cloud orchestration, AI governance, and automated CI/CD engine seat",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 60.0,
      costPrice: 15.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SUB-CRM-PRO",
      name: "DealFlow CRM Intelligence Suite",
      description: "Autonomous deal negotiation, pipeline analytics, and quota tracking subscription",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 45.0,
      costPrice: 10.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SUB-BACKUP-PRO",
      name: "IronVault Disaster Recovery Cloud",
      description: "Continuous block-level cloud backup with 15-minute point-in-time recovery",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 40.0,
      costPrice: 8.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SUB-SECURITY-SHIELD",
      name: "Sentinel Zero-Trust Endpoint Shield",
      description: "Next-gen AI EDR endpoint protection, ransomware rollback, and behavioral telemetry",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 25.0,
      costPrice: 5.0,
      taxRate: 18.0,
      isPromoted: true,
    },
    {
      sku: "SAAS-MONITORING-01",
      name: "Cloud Sentinel 24/7 Monitoring Suite",
      description: "Full-stack observability, real-time APM telemetry, and automated alerting",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 15000.0,
      costPrice: 5000.0,
      taxRate: 18.0,
      isPromoted: false,
    },
    {
      sku: "SB-SOFTWARE-79",
      name: "ShieldPro Enterprise Antivirus",
      description: "Managed malware prevention and endpoint security license",
      categoryId: categories["SaaS Subscriptions"].id,
      productType: "SUBSCRIPTION",
      basePrice: 1000.0,
      costPrice: 400.0,
      taxRate: 18.0,
      isPromoted: false,
    },
  ];

  const products = {};
  for (const p of productsData) {
    products[p.sku] = await prisma.product.create({ data: p });
  }
  console.log(`✔ Products catalog seeded (${Object.keys(products).length} products)`);

  // ==========================================================================
  // 7. Product Variants (PDF §4-A2)
  // ==========================================================================
  const variantsData = [
    {
      productId: products["HW-LAPTOP-15"].id,
      attribute: "RAM",
      value: "64GB DDR5 (+₹150)",
      extraPrice: 150.0,
    },
    {
      productId: products["HW-LAPTOP-15"].id,
      attribute: "Storage",
      value: "2TB PCIe Gen4 NVMe (+₹100)",
      extraPrice: 100.0,
    },
    {
      productId: products["HW-DESKTOP-ULTRA"].id,
      attribute: "GPU",
      value: "Dual NVIDIA RTX 6000 Ada (+₹600)",
      extraPrice: 600.0,
    },
  ];

  for (const v of variantsData) {
    await prisma.productVariant.create({ data: v });
  }
  console.log("✔ Product variants seeded");

  // ==========================================================================
  // 8. Price Lists & Price List Items (PDF §4-A2)
  // ==========================================================================
  const stdPriceList = await prisma.priceList.create({
    data: {
      name: "Standard Commercial INR",
      currency: "INR",
      isActive: true,
    },
  });

  for (const p of Object.values(products)) {
    await prisma.priceListItem.create({
      data: {
        priceListId: stdPriceList.id,
        productId: p.id,
        price: p.basePrice,
      },
    });
  }
  console.log("✔ Price lists seeded");

  // ==========================================================================
  // 9. Warehouses & Physical Inventory Layout (§9 steps 1 and 5)
  // ==========================================================================
  const warehousesData = [
    {
      code: "WH-MAIN",
      name: "Bengaluru Central Logistics DC",
      address: "Plot 18, Whitefield Hi-Tech Zone, Bengaluru, Karnataka 560066",
      shippingWeight: 1.0,
    },
    {
      code: "WH-EAST",
      name: "Kolkata Regional Fulfillment Hub",
      address: "Sector V, Salt Lake Electronic Complex, Kolkata, West Bengal 700091",
      shippingWeight: 1.8,
    },
    {
      code: "WH-WEST",
      name: "Mumbai Gateway Logistics DC",
      address: "Bhiwandi Logistics Hub, Mumbai, Maharashtra 421302",
      shippingWeight: 2.2,
    },
  ];

  const warehouses = {};
  for (const w of warehousesData) {
    warehouses[w.code] = await prisma.warehouse.create({ data: w });
  }
  console.log("✔ Warehouses seeded (WH-MAIN, WH-EAST, WH-WEST)");

  // Seed Inter-Warehouse pairwise route matrix
  const routePairs = [
    { fromWarehouseId: warehouses["WH-MAIN"].id, toWarehouseId: warehouses["WH-EAST"].id, weight: 2.5 },
    { fromWarehouseId: warehouses["WH-EAST"].id, toWarehouseId: warehouses["WH-MAIN"].id, weight: 2.5 },
    { fromWarehouseId: warehouses["WH-MAIN"].id, toWarehouseId: warehouses["WH-WEST"].id, weight: 1.5 },
    { fromWarehouseId: warehouses["WH-WEST"].id, toWarehouseId: warehouses["WH-MAIN"].id, weight: 1.5 },
    { fromWarehouseId: warehouses["WH-EAST"].id, toWarehouseId: warehouses["WH-WEST"].id, weight: 3.2 },
    { fromWarehouseId: warehouses["WH-WEST"].id, toWarehouseId: warehouses["WH-EAST"].id, weight: 3.2 },
  ];

  for (const rp of routePairs) {
    await prisma.warehouseShippingWeight.create({ data: rp });
  }
  console.log("✔ Inter-warehouse transit weight matrix seeded");

  // Multi-Warehouse Stock Configuration:
  // Engineered precisely for §9 Step 5:
  // HW-LAPTOP-15: Main=5, East=9 (Order of 12 forces split: WH-EAST: 9 and WH-MAIN: 3)
  // HW-SERVER-2U: East=4, Main=0
  // HW-DESKTOP-ULTRA: Main=15, East=10
  // HW-MONITOR-27: Main=25, East=15
  // HW-ROUTER-MESH: Main=12, East=8
  const inventoryData = [
    { sku: "HW-LAPTOP-15", code: "WH-MAIN", availableQty: 5, reservedQty: 0, reorderLevel: 3 },
    { sku: "HW-LAPTOP-15", code: "WH-EAST", availableQty: 9, reservedQty: 0, reorderLevel: 3 },
    { sku: "HW-SERVER-2U", code: "WH-MAIN", availableQty: 0, reservedQty: 0, reorderLevel: 2 },
    { sku: "HW-SERVER-2U", code: "WH-EAST", availableQty: 4, reservedQty: 0, reorderLevel: 2 },
    { sku: "HW-DESKTOP-ULTRA", code: "WH-MAIN", availableQty: 15, reservedQty: 0, reorderLevel: 3 },
    { sku: "HW-DESKTOP-ULTRA", code: "WH-EAST", availableQty: 10, reservedQty: 0, reorderLevel: 2 },
    { sku: "HW-MONITOR-27", code: "WH-MAIN", availableQty: 25, reservedQty: 0, reorderLevel: 5 },
    { sku: "HW-MONITOR-27", code: "WH-EAST", availableQty: 15, reservedQty: 0, reorderLevel: 3 },
    { sku: "HW-ROUTER-MESH", code: "WH-MAIN", availableQty: 12, reservedQty: 0, reorderLevel: 2 },
    { sku: "HW-ROUTER-MESH", code: "WH-EAST", availableQty: 8, reservedQty: 0, reorderLevel: 2 },
    { sku: "PRO-LAPTOP-01", code: "WH-MAIN", availableQty: 20, reservedQty: 0, reorderLevel: 5 },
    { sku: "PRO-WORKSTATION-01", code: "WH-MAIN", availableQty: 10, reservedQty: 0, reorderLevel: 2 },
    { sku: "PRO-SERVER-RACK-01", code: "WH-MAIN", availableQty: 8, reservedQty: 0, reorderLevel: 2 },
  ];

  for (const inv of inventoryData) {
    await prisma.inventory.create({
      data: {
        warehouseId: warehouses[inv.code].id,
        productId: products[inv.sku].id,
        availableQty: inv.availableQty,
        reservedQty: inv.reservedQty,
        reorderLevel: inv.reorderLevel,
      },
    });
  }
  console.log("✔ Multi-warehouse inventory seeded (engineered for 2-warehouse split)");

  // ==========================================================================
  // 10. Subscription Plans (§9 steps 1 and 6)
  // ==========================================================================
  const plansData = [
    {
      sku: "SUB-CLOUD-ENT",
      name: "AetherCloud Enterprise — Monthly",
      billingInterval: "MONTHLY",
      price: 60.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SUB-CRM-PRO",
      name: "DealFlow CRM Intelligence — Monthly",
      billingInterval: "MONTHLY",
      price: 45.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SUB-BACKUP-PRO",
      name: "IronVault Disaster Recovery — Monthly",
      billingInterval: "MONTHLY",
      price: 40.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SUB-SECURITY-SHIELD",
      name: "Sentinel Zero-Trust Shield — Monthly",
      billingInterval: "MONTHLY",
      price: 25.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
    {
      sku: "SAAS-MONITORING-01",
      name: "Cloud Sentinel Monitoring — Monthly",
      billingInterval: "MONTHLY",
      price: 15000.0,
      prorationEnabled: true,
      cancellationRefundPercent: 0.0,
    },
  ];

  const plans = {};
  for (const plan of plansData) {
    const product = products[plan.sku];
    plans[plan.sku] = await prisma.subscriptionPlan.create({
      data: {
        productId: product.id,
        name: plan.name,
        billingInterval: plan.billingInterval,
        price: plan.price,
        prorationEnabled: plan.prorationEnabled,
        cancellationRefundPercent: plan.cancellationRefundPercent,
        isActive: true,
      },
    });
  }
  console.log("✔ Subscription plans seeded (Monthly with proration enabled)");

  // ==========================================================================
  // 11. Co-Purchase (Upsell) Pairing Rules (PDF §4-A6 & §9 Step 4)
  // ==========================================================================
  const coPurchaseData = [
    { source: "HW-LAPTOP-15", suggested: "SUB-CRM-PRO", coPurchaseCount: 52, weight: 1.5, minMarginPercent: 20.0 },
    { source: "HW-LAPTOP-15", suggested: "SUB-SECURITY-SHIELD", coPurchaseCount: 45, weight: 1.4, minMarginPercent: 20.0 },
    { source: "HW-LAPTOP-15", suggested: "SRV-SETUP-01", coPurchaseCount: 38, weight: 1.2, minMarginPercent: 10.0 },
    { source: "HW-LAPTOP-15", suggested: "SUB-CLOUD-ENT", coPurchaseCount: 30, weight: 1.1, minMarginPercent: 20.0 },
    { source: "HW-SERVER-2U", suggested: "SUB-BACKUP-PRO", coPurchaseCount: 40, weight: 1.6, minMarginPercent: 15.0 },
    { source: "HW-SERVER-2U", suggested: "SRV-CONSULT-01", coPurchaseCount: 32, weight: 1.4, minMarginPercent: 10.0 },
    { source: "HW-DESKTOP-ULTRA", suggested: "HW-MONITOR-27", coPurchaseCount: 44, weight: 1.5, minMarginPercent: 15.0 },
    { source: "HW-DESKTOP-ULTRA", suggested: "SRV-MAINT-FLEET", coPurchaseCount: 28, weight: 1.2, minMarginPercent: 15.0 },
    { source: "SRV-CONSULT-01", suggested: "SUB-CRM-PRO", coPurchaseCount: 24, weight: 1.1, minMarginPercent: 20.0 },
    { source: "SRV-CONSULT-01", suggested: "SUB-CLOUD-ENT", coPurchaseCount: 20, weight: 1.0, minMarginPercent: 20.0 },
  ];

  for (const cp of coPurchaseData) {
    await prisma.coPurchaseRule.create({
      data: {
        sourceProductId: products[cp.source].id,
        suggestedProductId: products[cp.suggested].id,
        coPurchaseCount: cp.coPurchaseCount,
        weight: cp.weight,
        minMarginPercent: cp.minMarginPercent,
        isActive: true,
      },
    });
  }
  console.log("✔ Co-purchase (upsell) pairing rules seeded");

  // ==========================================================================
  // 12. Category Discount Ceilings (DiscountRules matching PDF §10 & §9)
  // ==========================================================================
  const discountRulesData = [
    // GOLD TIER
    {
      customerTierId: tiers["GOLD"].id,
      categoryId: categories["Hardware"].id,
      maxDiscountPercent: 15.0,
      minMarginPercent: 20.0,
    },
    {
      customerTierId: tiers["GOLD"].id,
      categoryId: categories["Professional Services"].id,
      maxDiscountPercent: 10.0, // Stricter ceiling triggers approval when 18% is requested!
      minMarginPercent: 15.0,
    },
    {
      customerTierId: tiers["GOLD"].id,
      categoryId: categories["SaaS Subscriptions"].id,
      maxDiscountPercent: 25.0,
      minMarginPercent: 30.0,
    },
    // SILVER TIER
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
    // BRONZE TIER
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
    await prisma.discountRule.create({ data: dr });
  }
  console.log("✔ Category discount rules seeded across all tiers");

  // ==========================================================================
  // 13. Default Approval Policy & Multi-level Ladder (§9 step 3)
  // ==========================================================================
  const defaultPolicy = await prisma.approvalPolicy.create({
    data: {
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
    await prisma.approvalPolicyStep.create({
      data: { approvalPolicyId: defaultPolicy.id, ...step },
    });
  }
  console.log("✔ Approval policy ladder seeded (Step 1: Sales Manager, Step 2: Finance)");

  // ==========================================================================
  // 14. Demo Customers (Across All Tiers with Realistic Corporate Names)
  // ==========================================================================
  const customersData = [
    {
      name: "OmniCorp Dynamics India",
      contactEmail: "procurement@omnicorp.in",
      phone: "+91 98765 43210",
      billingAddress: "Level 14, Tower B, Cyber City, Gurugram, Haryana 122002",
      customerTierId: tiers["GOLD"].id,
      ownerRepId: users["rep@dealflow360.com"].id,
    },
    {
      name: "Acme Corporation",
      contactEmail: "john.doe@acmecorp.com",
      phone: "+91 98234 56789",
      billingAddress: "Acme Industrial Estate, Whitefield, Bengaluru, KA 560066",
      customerTierId: tiers["GOLD"].id,
      ownerRepId: users["rep@dealflow360.com"].id,
    },
    {
      name: "InnovaTech Enterprises",
      contactEmail: "cto@innovatech.com",
      phone: "+91 98450 12345",
      billingAddress: "Mindspace Tech Park, Hitec City, Hyderabad, Telangana 500081",
      customerTierId: tiers["GOLD"].id,
      ownerRepId: users["rep.test@dealflow360.internal"].id,
    },
    {
      name: "Apex Cloud Networks",
      contactEmail: "it@apexcloud.io",
      phone: "+91 98765 11223",
      billingAddress: "Prestige Tech Cloud, Marathahalli, Bengaluru, KA 560087",
      customerTierId: tiers["SILVER"].id,
      ownerRepId: users["rep@dealflow360.com"].id,
    },
    {
      name: "CyberDyne Robotics Systems",
      contactEmail: "dev@cyberdyne.co.in",
      phone: "+91 98765 55443",
      billingAddress: "Bandra Kurla Complex (BKC), Bandra East, Mumbai, MH 400051",
      customerTierId: tiers["GOLD"].id,
      ownerRepId: users["priya@dealflow360.com"].id,
    },
    {
      name: "Starlight Media & Tech Studio",
      contactEmail: "accounts@starlight.media",
      phone: "+91 98765 99887",
      billingAddress: "Film City Sector 16A, Noida, Uttar Pradesh 201301",
      customerTierId: tiers["BRONZE"].id,
      ownerRepId: users["rep@dealflow360.com"].id,
    },
    {
      name: "Aether Logistics Global",
      contactEmail: "commercial@aetherlogistics.com",
      phone: "+91 98765 77665",
      billingAddress: "MIDC Logistics Zone, Chakan, Pune, Maharashtra 410501",
      customerTierId: tiers["SILVER"].id,
      ownerRepId: users["priya@dealflow360.com"].id,
    },
  ];

  const customers = {};
  for (const c of customersData) {
    customers[c.contactEmail] = await prisma.customer.create({ data: c });
  }
  console.log(`✔ Customers seeded (${Object.keys(customers).length} enterprise accounts)`);

  // ==========================================================================
  // 15. Historical Demo Quotations & Orders in Key Pipeline Stages
  // ==========================================================================
  console.log("\nSeeding realistic baseline demo quotations & orders...");

  // Helper function to create mathematically exact quotation lines
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
      marginFloorBreached: false,
    };
  }

  // --- Baseline Quote 1: Draft / In-Builder with Upsell Attached (Acme Corp) ---
  const q1Lines = [
    buildLineSnapshot({
      productId: products["HW-LAPTOP-15"].id,
      quantity: 5,
      discountPercent: 10.0,
      effectiveCeilingPercent: 15.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SUB-CRM-PRO"].id,
      subscriptionPlanId: plans["SUB-CRM-PRO"].id,
      lineType: "RECURRING",
      quantity: 5,
      discountPercent: 0.0,
      effectiveCeilingPercent: 25.0,
      addedViaUpsell: true,
      position: 1,
    }),
  ];
  const q1Totals = computeQuoteTotals(q1Lines);

  const demoQ1 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-2026-001",
      customerId: customers["john.doe@acmecorp.com"].id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: tiers["GOLD"].id,
      status: "DRAFT",
      ...q1Totals,
      lastActivityAt: new Date(Date.now() - 2 * 3600 * 1000),
      lines: {
        create: q1Lines.map(({ _math, _taxAmount, _productName, ...l }) => l),
      },
    },
  });

  // --- Baseline Quote 2: Over-Ceiling, in Manager Approval Ladder (OmniCorp Dynamics) ---
  const q2Lines = [
    buildLineSnapshot({
      productId: products["HW-LAPTOP-15"].id,
      quantity: 10,
      discountPercent: 12.0, // within 15%
      effectiveCeilingPercent: 15.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SRV-SETUP-01"].id,
      quantity: 2,
      discountPercent: 18.0, // EXCEEDS 10% ceiling by 8 pts!
      effectiveCeilingPercent: 10.0,
      position: 1,
    }),
  ];
  const q2Totals = computeQuoteTotals(q2Lines);

  const demoQ2 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-2026-002",
      customerId: customers["procurement@omnicorp.in"].id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: tiers["GOLD"].id,
      status: "PENDING_APPROVAL",
      ...q2Totals,
      lastActivityAt: new Date(Date.now() - 4 * 3600 * 1000),
      lines: {
        create: q2Lines.map(({ _math, _taxAmount, _productName, ...l }) => l),
      },
      approvals: {
        create: {
          approvalPolicyId: defaultPolicy.id,
          approvalCycle: 1,
          status: "PENDING",
          triggeredBy: "REP_SUBMIT",
          blendedScore: q2Totals.blendedScore,
          worstLineOverage: q2Totals.worstLineOverage,
          findings: [
            {
              productName: "QuickStart Enterprise Implementation & Onboarding",
              discountPercent: 18.0,
              ceilingPercent: 10.0,
              overagePts: 8.0,
            },
          ],
          steps: {
            create: [
              {
                stepOrder: 1,
                roleId: roles["SALES_MANAGER"].id,
                status: "PENDING",
              },
              {
                stepOrder: 2,
                roleId: roles["FINANCE"].id,
                status: "PENDING",
              },
            ],
          },
        },
      },
    },
  });

  // --- Baseline Quote 3 & Active Sales Order in Fulfillment (InnovaTech Enterprises) ---
  const q3Lines = [
    buildLineSnapshot({
      productId: products["HW-LAPTOP-15"].id,
      quantity: 12,
      discountPercent: 5.0,
      effectiveCeilingPercent: 15.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["SUB-CLOUD-ENT"].id,
      subscriptionPlanId: plans["SUB-CLOUD-ENT"].id,
      lineType: "RECURRING",
      quantity: 12,
      discountPercent: 0.0,
      effectiveCeilingPercent: 25.0,
      addedViaUpsell: true,
      position: 1,
    }),
  ];
  const q3Totals = computeQuoteTotals(q3Lines);

  const demoQ3 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-2026-003",
      customerId: customers["cto@innovatech.com"].id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: tiers["GOLD"].id,
      status: "APPROVED",
      ...q3Totals,
      lastActivityAt: new Date(Date.now() - 24 * 3600 * 1000),
      lines: {
        create: q3Lines.map(({ _math, _taxAmount, _productName, ...l }) => l),
      },
    },
    include: { lines: true },
  });

  // Order created and allocated with recommended 2-warehouse split
  const laptopOrderLine = demoQ3.lines.find((l) => l.productId === products["HW-LAPTOP-15"].id);
  const cloudOrderLine = demoQ3.lines.find((l) => l.productId === products["SUB-CLOUD-ENT"].id);

  const demoOrder1 = await prisma.order.create({
    data: {
      orderNumber: "ORD-2026-001",
      quotationId: demoQ3.id,
      customerId: demoQ3.customerId,
      status: "ALLOCATED",
      totalAmount: demoQ3.grandTotal,
      confirmedAt: new Date(Date.now() - 20 * 3600 * 1000),
      lines: {
        create: [
          {
            productId: products["HW-LAPTOP-15"].id,
            lineType: "ONE_TIME",
            quantity: 12,
            unitPrice: laptopOrderLine.unitPrice,
            unitCost: laptopOrderLine.unitCost,
            discountPercent: laptopOrderLine.discountPercent,
            taxRate: laptopOrderLine.taxRate,
            lineTotal: laptopOrderLine.lineTotal,
            quotationLineId: laptopOrderLine.id,
          },
          {
            productId: products["SUB-CLOUD-ENT"].id,
            subscriptionPlanId: plans["SUB-CLOUD-ENT"].id,
            lineType: "RECURRING",
            quantity: 12,
            unitPrice: cloudOrderLine.unitPrice,
            unitCost: cloudOrderLine.unitCost,
            discountPercent: cloudOrderLine.discountPercent,
            taxRate: cloudOrderLine.taxRate,
            lineTotal: cloudOrderLine.lineTotal,
            quotationLineId: cloudOrderLine.id,
          },
        ],
      },
    },
    include: { lines: true },
  });

  const ordLaptopLine = demoOrder1.lines.find((l) => l.productId === products["HW-LAPTOP-15"].id);

  // 2-Warehouse split allocations for 12 laptops (WH-EAST: 9, WH-MAIN: 3)
  await prisma.fulfillmentAllocation.createMany({
    data: [
      {
        orderId: demoOrder1.id,
        orderLineId: ordLaptopLine.id,
        warehouseId: warehouses["WH-EAST"].id,
        allocatedQty: 9,
        backorderQty: 0,
        status: "RESERVED",
      },
      {
        orderId: demoOrder1.id,
        orderLineId: ordLaptopLine.id,
        warehouseId: warehouses["WH-MAIN"].id,
        allocatedQty: 3,
        backorderQty: 0,
        status: "RESERVED",
      },
    ],
  });

  // Reserve stock for demo order
  await prisma.inventory.updateMany({
    where: { warehouseId: warehouses["WH-EAST"].id, productId: products["HW-LAPTOP-15"].id },
    data: { reservedQty: 9 },
  });
  await prisma.inventory.updateMany({
    where: { warehouseId: warehouses["WH-MAIN"].id, productId: products["HW-LAPTOP-15"].id },
    data: { reservedQty: 3 },
  });

  // Invoices for separate billing of one-time and recurring items
  const invOneTime = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-ORD-2026-001-01",
      orderId: demoOrder1.id,
      invoiceType: "ONE_TIME",
      status: "POSTED",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      subtotal: 11400.0,
      taxAmount: 2052.0,
      totalAmount: 13452.0,
      amountPaid: 0.0,
      lines: {
        create: [
          {
            orderLineId: ordLaptopLine.id,
            description: `${products["HW-LAPTOP-15"].name} — Fulfilled from: Kolkata Regional Fulfillment Hub (9 units), Bengaluru Central Logistics DC (3 units)`,
            quantity: 12,
            unitPrice: 950.0,
            taxAmount: 2052.0,
            lineTotal: 13452.0,
          },
        ],
      },
    },
  });

  const invRecurring = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-ORD-2026-001-02",
      orderId: demoOrder1.id,
      invoiceType: "RECURRING",
      status: "POSTED",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      subtotal: 720.0,
      taxAmount: 129.6,
      totalAmount: 849.6,
      amountPaid: 0.0,
      lines: {
        create: [
          {
            orderLineId: demoOrder1.lines.find((l) => l.productId === products["SUB-CLOUD-ENT"].id).id,
            description: `${products["SUB-CLOUD-ENT"].name} (Month 1 of 12 recurring subscription)`,
            quantity: 12,
            unitPrice: 60.0,
            taxAmount: 129.6,
            lineTotal: 849.6,
          },
        ],
      },
    },
  });

  // --- Baseline Quote 4: Completed Deal with Full Payment (Apex Cloud Networks) ---
  const q4Lines = [
    buildLineSnapshot({
      productId: products["HW-DESKTOP-ULTRA"].id,
      quantity: 2,
      discountPercent: 5.0,
      effectiveCeilingPercent: 10.0,
      position: 0,
    }),
    buildLineSnapshot({
      productId: products["HW-MONITOR-27"].id,
      quantity: 4,
      discountPercent: 0.0,
      effectiveCeilingPercent: 10.0,
      addedViaUpsell: true,
      position: 1,
    }),
  ];
  const q4Totals = computeQuoteTotals(q4Lines);

  const demoQ4 = await prisma.quotation.create({
    data: {
      quotationNumber: "QTN-2026-004",
      customerId: customers["it@apexcloud.io"].id,
      salesRepId: users["rep@dealflow360.com"].id,
      customerTierId: tiers["SILVER"].id,
      status: "CONFIRMED",
      ...q4Totals,
      lastActivityAt: new Date(Date.now() - 48 * 3600 * 1000),
      lines: {
        create: q4Lines.map(({ _math, _taxAmount, _productName, ...l }) => l),
      },
    },
    include: { lines: true },
  });

  const demoOrder2 = await prisma.order.create({
    data: {
      orderNumber: "ORD-2026-002",
      quotationId: demoQ4.id,
      customerId: demoQ4.customerId,
      status: "COMPLETED",
      totalAmount: demoQ4.grandTotal,
      confirmedAt: new Date(Date.now() - 40 * 3600 * 1000),
      lines: {
        create: demoQ4.lines.map((l) => ({
          productId: l.productId,
          lineType: l.lineType,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitCost: l.unitCost,
          discountPercent: l.discountPercent,
          taxRate: l.taxRate,
          lineTotal: l.lineTotal,
          quotationLineId: l.id,
        })),
      },
    },
    include: { lines: true },
  });

  const invCompleted = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-ORD-2026-002-01",
      orderId: demoOrder2.id,
      invoiceType: "ONE_TIME",
      status: "PAID",
      issueDate: new Date(Date.now() - 38 * 3600 * 1000),
      dueDate: new Date(Date.now() - 8 * 3600 * 1000),
      subtotal: demoQ4.subtotal,
      taxAmount: demoQ4.taxTotal,
      totalAmount: demoOrder2.totalAmount,
      amountPaid: demoOrder2.totalAmount,
      lines: {
        create: [
          {
            orderLineId: demoOrder2.lines[0].id,
            description: `${products["HW-DESKTOP-ULTRA"].name} (2 units) + ${products["HW-MONITOR-27"].name} (4 units) — Fulfilled from: Bengaluru Central Logistics DC`,
            quantity: 1,
            unitPrice: demoQ4.subtotal,
            taxAmount: demoQ4.taxTotal,
            lineTotal: demoOrder2.totalAmount,
          },
        ],
      },
      payments: {
        create: {
          recordedById: users["finance@dealflow360.com"].id,
          amount: demoOrder2.totalAmount,
          paymentMethod: "BANK_TRANSFER",
          transactionReference: "NEFT/RTGS settlement from Apex Cloud Networks",
          paidAt: new Date(Date.now() - 36 * 3600 * 1000),
        },
      },
    },
  });

  console.log("✔ Baseline demo quotations & orders seeded across pipeline stages:");
  console.log("   • QTN-2026-001 [DRAFT]: In Builder with Upsell item");
  console.log("   • QTN-2026-002 [PENDING_APPROVAL]: Over-Ceiling (8 pts) awaiting Manager Review");
  console.log("   • QTN-2026-003 [APPROVED] -> ORD-2026-001 [ALLOCATED]: Multi-Warehouse 2-Hub Split (9 East + 3 Main)");
  console.log("   • QTN-2026-004 [COMPLETED] -> ORD-2026-002 [COMPLETED]: Invoiced & Paid with Bank Transfer");

  console.log("\n======================================================================");
  console.log(" ALL SEEDING COMPLETED SUCCESSFULLY — READY FOR PIPELINE VERIFICATION! ");
  console.log("======================================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
