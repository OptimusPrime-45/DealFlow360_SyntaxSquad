import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import prisma from '../lib/prisma.js';

/**
 * DealFlow360 — Feature 1 Test Suite
 * 
 * Tests Covered:
 * 1. Seed / verify required test fixture (User, Tier, Customer, Product, Quotation).
 * 2. Token Generation: Issue portal magic link and confirm database record in `portal_tokens`.
 * 3. Public Verification: GET /api/portal/verify/:token returns 200 with valid session.
 * 4. Protected Fetch: GET /api/portal/quote with Bearer token returns quotation line items and totals.
 * 5. PRD Metric M6 Adversarial Test 1: Portal token presented to internal route FAILS (401/403).
 * 6. PRD Metric M6 Adversarial Test 2: Internal token presented to portal route FAILS (401).
 * 7. Token Expiry Check: Expired portal token FAILS (401).
 * 8. Revocation Check: Revoked portal token FAILS (401).
 * 9. Tampered Token Check: Modified portal token signature FAILS (401).
 */

const PORT = 4099; // Isolated test port
let server;
let baseUrl;

// Helper to send HTTP requests to the test server
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

// Test Runner Helper
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
  console.log(' Starting DealFlow360 Feature 1 Test Suite');
  console.log('====================================================\n');

  try {
    // 0. Start in-memory server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    baseUrl = `http://localhost:${PORT}`;

    // 1. Setup Test Fixture in Database
    console.log('Setting up test fixtures in PostgreSQL...');
    
    // Role & Sales Rep
    const role = await prisma.role.upsert({
      where: { code: 'SALES_REP' },
      update: {},
      create: { code: 'SALES_REP', name: 'Sales Representative', isSystem: true }
    });

    const user = await prisma.user.upsert({
      where: { email: 'rep.test@dealflow360.internal' },
      update: {},
      create: {
        email: 'rep.test@dealflow360.internal',
        fullName: 'Sarah Jenkins',
        passwordHash: 'dummy-hash',
        roleId: role.id
      }
    });

    // Customer Tier & Customer
    const tier = await prisma.customerTier.upsert({
      where: { code: 'GOLD' },
      update: {},
      create: { code: 'GOLD', name: 'Gold Tier', rank: 3, maxDiscountPercent: 15.0 }
    });

    const customer = await prisma.customer.upsert({
      where: { contactEmail: 'procurement@acmecorp.com' },
      update: {},
      create: {
        name: 'Acme Enterprise Solutions',
        contactEmail: 'procurement@acmecorp.com',
        billingAddress: '42 Industrial Park, Cyber City',
        customerTierId: tier.id,
        ownerRepId: user.id
      }
    });

    // Product & Category
    const category = await prisma.productCategory.upsert({
      where: { name: 'Hardware' },
      update: {},
      create: { name: 'Hardware', description: 'Computing hardware' }
    });

    const product = await prisma.product.upsert({
      where: { sku: 'PRO-LAPTOP-01' },
      update: {},
      create: {
        sku: 'PRO-LAPTOP-01',
        name: 'Enterprise Laptop 16-inch',
        description: 'High performance mobile workstation',
        categoryId: category.id,
        basePrice: 120000.00,
        costPrice: 85000.00,
        productType: 'ONE_TIME'
      }
    });

    // Test Quotation
    const quotation = await prisma.quotation.upsert({
      where: { quotationNumber: 'QT-2026-TEST-001' },
      update: {},
      create: {
        quotationNumber: 'QT-2026-TEST-001',
        customerId: customer.id,
        salesRepId: user.id,
        customerTierId: tier.id,
        status: 'SENT',
        subtotal: 240000.00,
        discountTotal: 24000.00,
        taxTotal: 38880.00,
        grandTotal: 254880.00,
        lines: {
          create: [
            {
              productId: product.id,
              lineType: 'ONE_TIME',
              quantity: 2,
              unitPrice: 120000.00,
              unitCost: 85000.00,
              discountPercent: 10.00,
              lineTotal: 216000.00,
              lineMarginPercent: 21.30,
              effectiveCeilingPercent: 15.00
            }
          ]
        }
      }
    });

    console.log(`✔ Fixtures ready: Quote ${quotation.quotationNumber} (ID: ${quotation.id})\n`);

    // ========================================================================
    // TEST 1: Portal Token Generation
    // ========================================================================
    console.log('▶ Test 1: Link Generation (POST /api/quotations/:id/portal-link)');
    const genRes = await apiRequest(`/api/quotations/${quotation.id}/portal-link`, {
      method: 'POST',
      body: JSON.stringify({ expiresInDays: 7 })
    });

    assert(genRes.status === 201, `Status is 201 Created (got ${genRes.status})`);
    assert(!!genRes.data?.data?.token, 'Response contains generated portal token');
    assert(genRes.data?.data?.quotationId === quotation.id, 'Token matches target quotationId');

    const generatedToken = genRes.data.data.token;
    const generatedTokenId = genRes.data.data.id;

    // Check DB record
    const dbTokenRecord = await prisma.portalToken.findUnique({
      where: { token: generatedToken }
    });
    assert(!!dbTokenRecord, 'Token record successfully persisted in database table portal_tokens');
    assert(dbTokenRecord?.isRevoked === false, 'New token record is not revoked');
    console.log('');

    // ========================================================================
    // TEST 2: Public Verification (GET /api/portal/verify/:token)
    // ========================================================================
    console.log('▶ Test 2: Public Token Verification (GET /api/portal/verify/:token)');
    const verifyRes = await apiRequest(`/api/portal/verify/${generatedToken}`);

    assert(verifyRes.status === 200, `Verification status is 200 OK (got ${verifyRes.status})`);
    assert(verifyRes.data?.data?.valid === true, 'Verification returns valid = true');
    assert(verifyRes.data?.data?.quotationNumber === 'QT-2026-TEST-001', 'Returns correct quotationNumber');
    console.log('');

    // ========================================================================
    // TEST 3: Protected Quotation Retrieval (GET /api/portal/quote)
    // ========================================================================
    console.log('▶ Test 3: Protected Quote Retrieval (GET /api/portal/quote with Bearer)');
    const quoteRes = await apiRequest('/api/portal/quote', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${generatedToken}`
      }
    });

    assert(quoteRes.status === 200, `Quote fetch status is 200 OK (got ${quoteRes.status})`);
    assert(quoteRes.data?.data?.quotationNumber === 'QT-2026-TEST-001', 'Fetched correct quote number');
    assert(quoteRes.data?.data?.lines?.length === 1, 'Quote contains expected line item count');
    assert(quoteRes.data?.data?.customer?.name === 'Acme Enterprise Solutions', 'Sanitized customer name returned');
    assert(quoteRes.data?.data?.financials?.grandTotal === 254880, 'Financial grand total matches');
    console.log('');

    // ========================================================================
    // TEST 4: Metric M6 Adversarial Test 1 (Portal token on internal route)
    // ========================================================================
    console.log('▶ Test 4: Metric M6 Security — Portal token on internal route MUST FAIL');
    const internalRes = await apiRequest('/api/internal/test-protected', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${generatedToken}`
      }
    });

    assert(internalRes.status === 401 || internalRes.status === 403,
      `Internal route rejected portal token with code ${internalRes.status} (Security barrier verified)`
    );
    assert(internalRes.data?.success === false, 'Internal response success is false');
    console.log('');

    // ========================================================================
    // TEST 5: Metric M6 Adversarial Test 2 (Internal token on portal route)
    // ========================================================================
    console.log('▶ Test 5: Metric M6 Security — Internal token on portal route MUST FAIL');
    // Forge an internal JWT signed with JWT_SECRET
    const internalToken = jwt.sign(
      { typ: 'internal', userId: user.id, role: 'SALES_REP' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const portalWithInternalRes = await apiRequest('/api/portal/quote', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${internalToken}`
      }
    });

    assert(portalWithInternalRes.status === 401,
      `Portal rejected internal token with code 401 (Signature verification barrier verified)`
    );
    assert(portalWithInternalRes.data?.success === false, 'Portal response success is false');
    console.log('');

    // ========================================================================
    // TEST 6: Token Expiry Check
    // ========================================================================
    console.log('▶ Test 6: Expired Token Rejection');
    // Create an already-expired token in DB
    const expiredTokenString = jwt.sign(
      { typ: 'portal', quotationId: quotation.id, customerId: customer.id },
      process.env.PORTAL_JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const expiredRes = await apiRequest(`/api/portal/verify/${expiredTokenString}`);
    assert(expiredRes.status === 401, `Expired token returns 401 (got ${expiredRes.status})`);
    console.log('');

    // ========================================================================
    // TEST 7: Revoked Token Check
    // ========================================================================
    console.log('▶ Test 7: Revoked Token Rejection');
    // Revoke the generated token in the DB
    await prisma.portalToken.update({
      where: { id: generatedTokenId },
      data: { isRevoked: true }
    });

    const revokedRes = await apiRequest(`/api/portal/verify/${generatedToken}`);
    assert(revokedRes.status === 401, `Revoked token returns 401 (got ${revokedRes.status})`);
    assert(revokedRes.data?.error?.message?.includes('revoked'), 'Error message mentions revocation');
    console.log('');

    // ========================================================================
    // TEST 8: Malformed / Tampered Token Check
    // ========================================================================
    console.log('▶ Test 8: Tampered Token Rejection');
    const tamperedRes = await apiRequest(`/api/portal/verify/${generatedToken}tampered123`);
    assert(tamperedRes.status === 401, `Tampered token returns 401 (got ${tamperedRes.status})`);
    console.log('');

    // Print Final Summary
    console.log('====================================================');
    console.log(` TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
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
