import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. System Roles
  const rolesData = [
    { code: 'ADMIN', name: 'Administrator', isSystem: true },
    { code: 'SALES_REP', name: 'Sales Representative', isSystem: true },
    { code: 'SALES_MANAGER', name: 'Sales Manager', isSystem: true },
    { code: 'FINANCE', name: 'Finance', isSystem: true },
  ];

  const roles = {};
  for (const r of rolesData) {
    roles[r.code] = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    });
  }
  console.log('✔ Roles seeded');

  // 2. Singleton Governance Settings
  await prisma.governanceSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      scoreStrategy: 'VALUE_WEIGHTED',
      unconfiguredCeilingPolicy: 'DENY',
      stalledAfterDays: 7,
      anomalyDeviationPoints: 5,
    },
  });
  console.log('✔ Governance settings seeded');

  // 3. Customer Tiers
  const tiersData = [
    { code: 'BRONZE', name: 'Bronze Tier', rank: 1, maxDiscountPercent: 5.0 },
    { code: 'SILVER', name: 'Silver Tier', rank: 2, maxDiscountPercent: 10.0 },
    { code: 'GOLD', name: 'Gold Tier', rank: 3, maxDiscountPercent: 15.0 },
  ];

  for (const t of tiersData) {
    await prisma.customerTier.upsert({
      where: { code: t.code },
      update: {},
      create: t,
    });
  }
  console.log('✔ Customer tiers seeded');

  // 4. Default Approval Policy
  const defaultPolicy = await prisma.approvalPolicy.upsert({
    where: { name: 'Standard Approval Ladder' },
    update: { isActive: true },
    create: {
      name: 'Standard Approval Ladder',
      isActive: true,
    },
  });

  // Steps for Standard Approval Ladder
  const existingSteps = await prisma.approvalPolicyStep.count({
    where: { approvalPolicyId: defaultPolicy.id },
  });

  if (existingSteps === 0) {
    await prisma.approvalPolicyStep.createMany({
      data: [
        {
          approvalPolicyId: defaultPolicy.id,
          roleId: roles['SALES_MANAGER'].id,
          stepOrder: 1,
          minBlendedScore: 5.0,
          minWorstLineOverage: 5.0,
        },
        {
          approvalPolicyId: defaultPolicy.id,
          roleId: roles['FINANCE'].id,
          stepOrder: 2,
          minBlendedScore: 15.0,
          minWorstLineOverage: 15.0,
        },
      ],
    });
  }
  console.log('✔ Default approval ladder seeded');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
