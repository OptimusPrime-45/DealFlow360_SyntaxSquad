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

  const existingSteps = await prisma.approvalPolicyStep.count({
    where: { approvalPolicyId: defaultPolicy.id },
  });

  if (existingSteps === 0) {
    await prisma.approvalPolicyStep.createMany({
      data: [
        {
          approvalPolicyId: defaultPolicy.id,
          roleId: roles["SALES_MANAGER"].id,
          stepOrder: 1,
          minBlendedScore: 5.0,
          minWorstLineOverage: 5.0,
        },
        {
          approvalPolicyId: defaultPolicy.id,
          roleId: roles["FINANCE"].id,
          stepOrder: 2,
          minBlendedScore: 15.0,
          minWorstLineOverage: 15.0,
        },
      ],
    });
  }
  console.log("✔ Default approval ladder seeded");

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
