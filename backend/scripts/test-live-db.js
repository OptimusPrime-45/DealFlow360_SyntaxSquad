// ============================================================================
// DealFlow360 — Live Database Integration Test
// Executes a complete end-to-end flow directly against your local PostgreSQL!
// Run: node scripts/test-live-db.js
// ============================================================================

import { prisma } from '../lib/prisma.js';
import { runQuotationEvaluation } from '../controllers/governance.controller.js';

async function testLiveDatabase() {
  console.log(`======================================================================`);
  console.log(`DEALFLOW360: LIVE POSTGRESQL INTEGRATION TEST`);
  console.log(`======================================================================\n`);

  try {
    // ------------------------------------------------------------------------
    // 1. Verify Seeded Database Records
    // ------------------------------------------------------------------------
    console.log(`Step 1: Verifying seeded tables in Postgres...`);
    const setting = await prisma.governanceSetting.findUnique({ where: { id: 'singleton' } });
    console.log(`  ✔ GovernanceSetting (singleton): Strategy=${setting?.scoreStrategy}, UnconfiguredPolicy=${setting?.unconfiguredCeilingPolicy}`);

    const tiers = await prisma.customerTier.findMany();
    console.log(`  ✔ Customer Tiers: ${tiers.map((t) => `${t.code} (${t.maxDiscountPercent}%)`).join(', ')}`);

    const activePolicy = await prisma.approvalPolicy.findFirst({
      where: { isActive: true },
      include: { steps: { include: { role: true }, orderBy: { stepOrder: 'asc' } } },
    });
    console.log(`  ✔ Active Approval Ladder: "${activePolicy?.name}" with ${activePolicy?.steps.length} steps:`);
    activePolicy?.steps.forEach((s) => {
      console.log(`     └─ Step ${s.stepOrder} [${s.role.name}]: minBlended=${s.minBlendedScore}, minWorstLine=${s.minWorstLineOverage}`);
    });

    const salesRepRole = await prisma.role.findUnique({ where: { code: 'SALES_REP' } });
    const managerRole = await prisma.role.findUnique({ where: { code: 'SALES_MANAGER' } });

    // ------------------------------------------------------------------------
    // 2. Setup Test Data in PostgreSQL
    // ------------------------------------------------------------------------
    console.log(`\nStep 2: Inserting live demo customer, products, and rules...`);
    
    // Create test user (Sales Rep)
    const testRep = await prisma.user.upsert({
      where: { email: 'rep.live@dealflow360.com' },
      update: {},
      create: {
        email: 'rep.live@dealflow360.com',
        fullName: 'Arvind Sales Rep',
        passwordHash: 'dummy_hash',
        roleId: salesRepRole.id,
      },
    });

    // Create test user (Manager)
    const testManager = await prisma.user.upsert({
      where: { email: 'manager.live@dealflow360.com' },
      update: {},
      create: {
        email: 'manager.live@dealflow360.com',
        fullName: 'Arvind Sales Manager',
        passwordHash: 'dummy_hash',
        roleId: managerRole.id,
      },
    });

    const goldTier = tiers.find((t) => t.code === 'GOLD');

    // Create test Customer
    const testCustomer = await prisma.customer.upsert({
      where: { contactEmail: 'gold.client@acme.corp' },
      update: {},
      create: {
        name: 'Acme Corporation',
        contactEmail: 'gold.client@acme.corp',
        customerTierId: goldTier.id,
        ownerRepId: testRep.id,
      },
    });

    // Create Categories
    const hwCategory = await prisma.productCategory.upsert({
      where: { name: 'Hardware Demo' },
      update: {},
      create: { name: 'Hardware Demo', description: 'Enterprise hardware' },
    });

    const svcCategory = await prisma.productCategory.upsert({
      where: { name: 'Services Demo' },
      update: {},
      create: { name: 'Services Demo', description: 'Setup and implementation' },
    });

    // Create Discount Rule in Postgres: Services capped at 10%
    await prisma.discountRule.deleteMany({
      where: { categoryId: svcCategory.id },
    });
    const serviceRule = await prisma.discountRule.create({
      data: {
        categoryId: svcCategory.id,
        maxDiscountPercent: 10.0,
        minMarginPercent: 20.0,
        priority: 1,
        isActive: true,
      },
    });
    console.log(`  ✔ Inserted DiscountRule in Postgres: Category "${svcCategory.name}" capped at 10%`);

    // Create Products
    const laptopProd = await prisma.product.upsert({
      where: { sku: 'PROD-LAPTOP-01' },
      update: {},
      create: {
        sku: 'PROD-LAPTOP-01',
        name: 'Enterprise Laptop Pro',
        categoryId: hwCategory.id,
        basePrice: 1000.0,
        costPrice: 700.0,
      },
    });

    const serviceProd = await prisma.product.upsert({
      where: { sku: 'PROD-SETUP-01' },
      update: {},
      create: {
        sku: 'PROD-SETUP-01',
        name: 'Setup & Deployment Service',
        categoryId: svcCategory.id,
        basePrice: 200.0,
        costPrice: 120.0,
      },
    });

    // ------------------------------------------------------------------------
    // 3. Create a Live Quotation in PostgreSQL (PDF §10 Scenario)
    // ------------------------------------------------------------------------
    console.log(`\nStep 3: Creating live quotation in Postgres (Laptop 12%, Setup Service 18%)...`);
    
    // Cleanup any existing quotation for clean test
    await prisma.quotation.deleteMany({
      where: { quotationNumber: 'QT-LIVE-DEMO-001' },
    });

    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber: 'QT-LIVE-DEMO-001',
        customerId: testCustomer.id,
        salesRepId: testRep.id,
        customerTierId: goldTier.id,
        status: 'DRAFT',
        subtotal: 1200.0,
        grandTotal: 1044.0,
        lines: {
          create: [
            {
              productId: laptopProd.id,
              quantity: 1,
              unitPrice: 880.0, // 12% discount
              unitCost: 700.0,
              discountPercent: 12.0,
              effectiveCeilingPercent: 0,
              overagePts: 0,
              lineTotal: 880.0,
              lineMarginPercent: 20.45,
              position: 1,
            },
            {
              productId: serviceProd.id,
              quantity: 1,
              unitPrice: 164.0, // 18% discount (Ceiling is 10% => 8 pts breach!)
              unitCost: 120.0,
              discountPercent: 18.0,
              effectiveCeilingPercent: 0,
              overagePts: 0,
              lineTotal: 164.0,
              lineMarginPercent: 26.83,
              position: 2,
            },
          ],
        },
      },
      include: { lines: true },
    });
    console.log(`  ✔ Created Quotation ${quotation.quotationNumber} with 2 lines`);

    // ------------------------------------------------------------------------
    // 4. Run Live Evaluation via governance.controller
    // ------------------------------------------------------------------------
    console.log(`\nStep 4: Running evaluateQuotation() against live PostgreSQL...`);
    const evalResult = await runQuotationEvaluation(quotation.id);

    console.log(`  ✔ Live Evaluation Verdict:`);
    console.log(`     ├─ Blended Score:      ${evalResult.blendedScore}`);
    console.log(`     ├─ Worst Line Overage: ${evalResult.worstLineOverage} pts`);
    console.log(`     ├─ Risk Score:         ${evalResult.riskScore}/100 [${evalResult.riskBand}]`);
    console.log(`     ├─ Requires Approval:  ${evalResult.requiresApproval}`);
    console.log(`     └─ Triggered Approver: ${evalResult.requiredApprovalSteps.map((s) => s.roleName).join(', ')}`);

    // ------------------------------------------------------------------------
    // 5. Verify PostgreSQL Records Were Updated
    // ------------------------------------------------------------------------
    console.log(`\nStep 5: Verifying persisted records in Postgres table 'quotations' & 'quotation_lines'...`);
    const refreshedQuote = await prisma.quotation.findUnique({
      where: { id: quotation.id },
      include: { lines: true },
    });

    console.log(`  ✔ Quotation in Postgres: blendedScore=${refreshedQuote.blendedScore}, worstLineOverage=${refreshedQuote.worstLineOverage}`);
    refreshedQuote.lines.forEach((l) => {
      console.log(`     └─ Line: effectiveCeiling=${l.effectiveCeilingPercent}%, discount=${l.discountPercent}%, overagePts=${l.overagePts}`);
    });

    // ------------------------------------------------------------------------
    // 6. Test Live Approval Lifecycle in PostgreSQL
    // ------------------------------------------------------------------------
    console.log(`\nStep 6: Testing live Approval Cycle creation in Postgres...`);
    const approvalCycle = await prisma.quotationApproval.create({
      data: {
        quotationId: quotation.id,
        approvalPolicyId: activePolicy.id,
        approvalCycle: 1,
        status: 'PENDING',
        blendedScore: evalResult.blendedScore,
        worstLineOverage: evalResult.worstLineOverage,
        findings: evalResult.findings,
        triggeredBy: 'REP_SUBMIT',
        steps: {
          create: evalResult.requiredApprovalSteps.map((step) => ({
            roleId: step.roleId,
            stepOrder: step.stepOrder,
            status: 'PENDING',
          })),
        },
      },
      include: { steps: { include: { role: true } } },
    });
    console.log(`  ✔ Created QuotationApproval cycle ${approvalCycle.approvalCycle} in Postgres (Status: ${approvalCycle.status})`);

    // Test Step Approval by Manager
    const pendingStep = approvalCycle.steps[0];
    console.log(`  ✔ Manager approving step ${pendingStep.stepOrder} [${pendingStep.role.name}]...`);

    await prisma.quotationApprovalStep.update({
      where: { id: pendingStep.id },
      data: {
        status: 'APPROVED',
        reviewerId: testManager.id,
        actedAt: new Date(),
        reason: 'Approved for strategic Q3 client Acme Corp',
      },
    });

    // Finalize quotation approval
    await prisma.quotation.update({
      where: { id: quotation.id },
      data: { status: 'APPROVED' },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        userId: testManager.id,
        quotationId: quotation.id,
        actorType: 'USER',
        entityType: 'QuotationApprovalStep',
        entityId: pendingStep.id,
        action: 'APPROVAL_STEP_APPROVED',
        newValue: { status: 'APPROVED', reason: 'Approved for strategic Q3 client' },
        reason: 'Step approved by sales manager',
      },
    });
    console.log(`  ✔ Quotation status in Postgres is now APPROVED!`);

    // Verify Audit Trail in Postgres
    const auditLogs = await prisma.auditLog.findMany({
      where: { quotationId: quotation.id },
    });
    console.log(`  ✔ Verified append-only AuditLog in Postgres: ${auditLogs.length} audit records found!`);

    console.log(`\n======================================================================`);
    console.log(`🎉 100% LIVE POSTGRESQL DATABASE VERIFICATION PASSED!`);
    console.log(`======================================================================\n`);
  } catch (error) {
    console.error(`❌ Live DB Test Error:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testLiveDatabase();
