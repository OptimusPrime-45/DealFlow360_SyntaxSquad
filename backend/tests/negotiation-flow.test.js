import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import prisma from '../lib/prisma.js';

/**
 * DealFlow360 — Feature 2 Test Suite: Customer Negotiation & Automatic Approval Loop (§9 Step 7)
 * 
 * Tests Covered:
 * 1. Seed test fixture with Quotation and Line Item (Ceiling = 15%).
 * 2. Submit Counter-Offer: Customer submits 12% discount counter via portal -> 201 Created.
 * 3. Quotation Status Transition: Status moves to UNDER_NEGOTIATION and lastActivityAt updates.
 * 4. Audit Trail: AuditLog records CUSTOMER_COUNTER_SUBMITTED with actorType = CUSTOMER.
 * 5. Invariant 3: Multiple asks reuse the single OPEN negotiation session.
 * 6. Input Validation: Rejection of negative discounts, discounts > 100%, and empty messages (400).
 * 7. Cross-Quote Security: Submitting counter for another quote's line item is rejected (403).
 * 8. Customer History Retrieval: GET /api/portal/negotiations returns active session and requests.
 * 9. Rep Decline: Staff declines an ask -> status becomes DECLINED with response message.
 * 10. Automatic Re-Evaluation (§9 Step 7): Rep accepts 18% counter (exceeding 15% ceiling) ->
 *     QuotationLine updates to 18%, and Quotation automatically transitions to PENDING_APPROVAL
 *     with triggerSource = CUSTOMER_NEGOTIATION.
 */

const PORT = 4098; // Isolated test port
let server;
let baseUrl;

async function apiRequest(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ✘ FAIL: ${message}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log(' Starting DealFlow360 Feature 2: Negotiation Test Suite');
  console.log('====================================================\n');

  try {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    baseUrl = `http://localhost:${PORT}`;

    // 1. Setup Test Fixtures
    console.log('Setting up negotiation fixtures in PostgreSQL...');

    const role = await prisma.role.upsert({
      where: { code: 'SALES_REP' },
      update: {},
      create: { code: 'SALES_REP', name: 'Sales Representative', isSystem: true }
    });

    const rep = await prisma.user.upsert({
      where: { email: 'rep.neg@dealflow360.internal' },
      update: {},
      create: {
        email: 'rep.neg@dealflow360.internal',
        fullName: 'Marcus Vance',
        passwordHash: 'dummy-hash',
        roleId: role.id
      }
    });

    const tier = await prisma.customerTier.upsert({
      where: { code: 'GOLD' },
      update: {},
      create: { code: 'GOLD', name: 'Gold Tier', rank: 3, maxDiscountPercent: 15.0 }
    });

    const customer = await prisma.customer.upsert({
      where: { contactEmail: 'director@innovatech.com' },
      update: {},
      create: {
        name: 'InnovaTech Enterprises',
        contactEmail: 'director@innovatech.com',
        customerTierId: tier.id,
        ownerRepId: rep.id
      }
    });

    const category = await prisma.productCategory.upsert({
      where: { name: 'Hardware' },
      update: {},
      create: { name: 'Hardware', description: 'Computing hardware' }
    });

    const product = await prisma.product.upsert({
      where: { sku: 'PRO-WORKSTATION-01' },
      update: {},
      create: {
        sku: 'PRO-WORKSTATION-01',
        name: 'Pro Workstation Tower',
        description: 'CAD/Engineering Workstation',
        categoryId: category.id,
        basePrice: 150000.00,
        costPrice: 100000.00,
        productType: 'ONE_TIME'
      }
    });

    // Ensure an active ApprovalPolicy exists for the auto-approval test
    const policy = await prisma.approvalPolicy.upsert({
      where: { name: 'Standard Approval Ladder' },
      update: { isActive: true },
      create: { name: 'Standard Approval Ladder', isActive: true }
    });

    // Clean up any prior test quotation with this number
    const existingQuote = await prisma.quotation.findUnique({
      where: { quotationNumber: 'QT-2026-NEG-001' }
    });
    if (existingQuote) {
      await prisma.quotation.delete({ where: { id: existingQuote.id } });
    }

    // Create fresh test Quotation with ceiling = 15%, initial discount = 10%
    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber: 'QT-2026-NEG-001',
        customerId: customer.id,
        salesRepId: rep.id,
        customerTierId: tier.id,
        status: 'SENT',
        subtotal: 300000.00,
        discountTotal: 30000.00,
        taxTotal: 48600.00,
        grandTotal: 318600.00,
        lines: {
          create: [
            {
              productId: product.id,
              lineType: 'ONE_TIME',
              quantity: 2,
              unitPrice: 150000.00,
              unitCost: 100000.00,
              discountPercent: 10.00,
              effectiveCeilingPercent: 15.00,
              lineTotal: 270000.00,
              lineMarginPercent: 25.92,
              overagePts: 0.00
            }
          ]
        }
      },
      include: { lines: true }
    });

    const quoteLineId = quotation.lines[0].id;

    // Generate Customer Portal Token
    const portalTokenPayload = {
      typ: 'portal',
      quotationId: quotation.id,
      customerId: customer.id
    };
    const portalToken = jwt.sign(portalTokenPayload, process.env.PORTAL_JWT_SECRET, { expiresIn: '7d' });

    await prisma.portalToken.create({
      data: {
        quotationId: quotation.id,
        token: portalToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    console.log(`✔ Fixtures ready: Quotation ${quotation.quotationNumber} (ID: ${quotation.id})\n`);

    // ========================================================================
    // TEST 1: Customer Submits Counter-Offer
    // ========================================================================
    console.log('▶ Test 1: Customer Submits Counter-Offer (POST /api/portal/negotiate)');
    const counterRes = await apiRequest('/api/portal/negotiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: JSON.stringify({
        quotationLineId: quoteLineId,
        requestType: 'DISCOUNT',
        proposedDiscountPercent: 12,
        message: 'We are ordering 2 workstations upfront; requesting 12% discount.'
      })
    });

    assert(counterRes.status === 201, `Status is 201 Created (got ${counterRes.status})`);
    assert(!!counterRes.data?.data?.requestId, 'Returned negotiation requestId');
    assert(counterRes.data?.data?.proposedDiscountPercent === 12, 'Proposed discount is 12%');

    const firstRequestId = counterRes.data.data.requestId;
    const negotiationId = counterRes.data.data.negotiationId;

    // Check DB state of quotation
    const updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
    assert(updatedQuote.status === 'UNDER_NEGOTIATION', 'Quotation status transitioned to UNDER_NEGOTIATION');
    console.log('');

    // ========================================================================
    // TEST 2: Audit Trail Logged
    // ========================================================================
    console.log('▶ Test 2: Audit Log Records Customer Action');
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        quotationId: quotation.id,
        action: 'CUSTOMER_COUNTER_SUBMITTED'
      }
    });
    assert(!!auditRecord, 'AuditLog entry created for negotiation');
    assert(auditRecord?.actorType === 'CUSTOMER', 'actorType is CUSTOMER');
    console.log('');

    // ========================================================================
    // TEST 3: Invariant 3 (Reusing Active OPEN Negotiation Session)
    // ========================================================================
    console.log('▶ Test 3: Invariant 3 — Submitting a second ask reuses the existing OPEN negotiation session');
    const secondCounterRes = await apiRequest('/api/portal/negotiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: JSON.stringify({
        requestType: 'QUESTION',
        message: 'Can delivery be expedited to within 3 business days?'
      })
    });

    assert(secondCounterRes.status === 201, `Second ask returns 201 Created`);
    assert(secondCounterRes.data?.data?.negotiationId === negotiationId,
      'Second ask reuses the same negotiationId (Invariant 3 honored)'
    );

    const openSessionsCount = await prisma.negotiation.count({
      where: { quotationId: quotation.id, status: 'OPEN' }
    });
    assert(openSessionsCount === 1, 'Exactly one OPEN negotiation session exists in database');
    console.log('');

    // ========================================================================
    // TEST 4: Input Validations
    // ========================================================================
    console.log('▶ Test 4: Input Validation Edge Cases');
    
    // Negative discount
    const negDiscountRes = await apiRequest('/api/portal/negotiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: JSON.stringify({
        requestType: 'DISCOUNT',
        proposedDiscountPercent: -5,
        message: 'Invalid discount test'
      })
    });
    assert(negDiscountRes.status === 400, 'Rejects negative discount with 400');

    // Discount > 100%
    const highDiscountRes = await apiRequest('/api/portal/negotiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: JSON.stringify({
        requestType: 'DISCOUNT',
        proposedDiscountPercent: 125,
        message: 'Invalid discount test'
      })
    });
    assert(highDiscountRes.status === 400, 'Rejects discount > 100% with 400');

    // Empty message
    const emptyMsgRes = await apiRequest('/api/portal/negotiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: JSON.stringify({
        requestType: 'DISCOUNT',
        proposedDiscountPercent: 12,
        message: '   '
      })
    });
    assert(emptyMsgRes.status === 400, 'Rejects empty message with 400');
    console.log('');

    // ========================================================================
    // TEST 5: Cross-Quote Security
    // ========================================================================
    console.log('▶ Test 5: Cross-Quote Security Check');
    const fakeLineRes = await apiRequest('/api/portal/negotiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: JSON.stringify({
        quotationLineId: 'some-alien-line-id-from-another-quote',
        requestType: 'DISCOUNT',
        proposedDiscountPercent: 12,
        message: 'Attempting to touch foreign line item'
      })
    });
    assert(fakeLineRes.status === 403, 'Rejects foreign line item with 403 Forbidden');
    console.log('');

    // ========================================================================
    // TEST 6: Customer Retrieves Negotiation Timeline
    // ========================================================================
    console.log('▶ Test 6: Customer Retrieves Negotiation History (GET /api/portal/negotiations)');
    const timelineRes = await apiRequest('/api/portal/negotiations', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${portalToken}` }
    });

    assert(timelineRes.status === 200, 'Timeline fetch returns 200 OK');
    assert(timelineRes.data?.data?.hasActiveNegotiation === true, 'hasActiveNegotiation is true');
    assert(timelineRes.data?.data?.requests?.length === 2, 'Returns both requests in the session');
    console.log('');

    // ========================================================================
    // TEST 7: Staff Declines Request
    // ========================================================================
    console.log('▶ Test 7: Staff Declines a Request (POST /api/negotiations/requests/:id/respond)');
    const secondRequestId = secondCounterRes.data.data.requestId;

    const declineRes = await apiRequest(`/api/negotiations/requests/${secondRequestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'DECLINE',
        responseMessage: 'Standard delivery is 5 business days; expedited shipping not available.',
        userId: rep.id
      })
    });

    assert(declineRes.status === 200, 'Decline returns 200 OK');
    assert(declineRes.data?.data?.status === 'DECLINED', 'Status updated to DECLINED');

    const declinedDbRecord = await prisma.negotiationRequest.findUnique({ where: { id: secondRequestId } });
    assert(declinedDbRecord?.status === 'DECLINED', 'Database record status is DECLINED');
    console.log('');

    // ========================================================================
    // TEST 8: Automatic Re-Evaluation (§9 Step 7 — Core Thesis)
    // ========================================================================
    console.log('▶ Test 8: Rep Accepts 18% Discount (Breaches 15% Ceiling) -> AUTO APPROVAL LOOP');

    // Customer submits a counter proposing 18% (ceiling is 15%)
    const highCounter = await apiRequest('/api/portal/negotiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: JSON.stringify({
        quotationLineId: quoteLineId,
        requestType: 'DISCOUNT',
        proposedDiscountPercent: 18,
        message: 'Final offer: if you can do 18% discount, we will sign today.'
      })
    });

    const highRequestId = highCounter.data.data.requestId;

    // Rep accepts the 18% counter
    const acceptRes = await apiRequest(`/api/negotiations/requests/${highRequestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'ACCEPT',
        responseMessage: 'Accepted 18% discount subject to executive approval.',
        userId: rep.id
      })
    });

    assert(acceptRes.status === 200, 'Accept returns 200 OK');
    assert(acceptRes.data?.data?.reEvaluationTriggered === true, 'reEvaluationTriggered is TRUE');
    assert(acceptRes.data?.data?.quotationStatus === 'PENDING_APPROVAL',
      'Quotation status automatically changed to PENDING_APPROVAL (§9 Step 7 passed!)'
    );

    // Verify Quotation in Database
    const finalQuote = await prisma.quotation.findUnique({
      where: { id: quotation.id },
      include: { lines: true }
    });
    assert(finalQuote.status === 'PENDING_APPROVAL', 'DB Quotation status is PENDING_APPROVAL');
    assert(Number(finalQuote.lines[0].discountPercent) === 18, 'DB Quotation line discount updated to 18%');
    assert(Number(finalQuote.lines[0].overagePts) === 3, 'DB Quotation line overagePts is 3 (18 - 15)');

    // Verify QuotationApproval created with triggeredBy = CUSTOMER_NEGOTIATION
    const approvalRecord = await prisma.quotationApproval.findFirst({
      where: {
        quotationId: quotation.id,
        triggeredBy: 'CUSTOMER_NEGOTIATION'
      }
    });
    assert(!!approvalRecord, 'QuotationApproval record created with triggeredBy = CUSTOMER_NEGOTIATION');
    assert(approvalRecord?.status === 'PENDING', 'Approval cycle status is PENDING');

    // Verify Audit Trail
    const reEvalAudit = await prisma.auditLog.findFirst({
      where: {
        quotationId: quotation.id,
        action: 'APPROVAL_TRIGGERED_BY_NEGOTIATION'
      }
    });
    assert(!!reEvalAudit, 'AuditLog recorded APPROVAL_TRIGGERED_BY_NEGOTIATION');
    console.log('');

    // Summary
    console.log('====================================================');
    console.log(` FEATURE 2 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test execution error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

runTests();
