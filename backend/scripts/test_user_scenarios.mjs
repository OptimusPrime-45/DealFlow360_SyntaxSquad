const BASE_URL = 'http://localhost:4000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error?.message || `HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data.data !== undefined ? data.data : data;
}

async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  return data.accessToken || data.token;
}

async function runTests() {
  console.log('=== Step 1: Authenticate Users ===');
  const repToken = await login('rep@dealflow360.com', 'Password123!');
  console.log('✓ Sales Rep logged in');

  const mgrToken = await login('manager@dealflow360.com', 'Password123!');
  console.log('✓ Sales Manager logged in');

  const finToken = await login('finance@dealflow360.com', 'Password123!');
  console.log('✓ Finance Manager logged in');

  // Fetch customer and product
  const customers = await request('/customers', {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  const goldCustomer = customers.customers?.find(c => c.customerTier?.name?.includes('Gold')) || customers.customers?.[0];
  console.log('Using Customer:', goldCustomer.name, 'Tier:', goldCustomer.customerTier?.name);

  const products = await request('/products', {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  const hwProduct = products.products?.find(p => p.category?.name === 'Hardware') || products.products?.[0];
  console.log('Using Product:', hwProduct.name, 'Category:', hwProduct.category?.name);

  // ==========================================
  // SCENARIO 1: MODERATE RISK
  // Discount over ceiling by 2-3% (e.g. 17% vs 15% ceiling)
  // Expected:
  // - Routing requires Sales Manager only
  // - Sales Manager approves -> Quotation becomes APPROVED
  // ==========================================
  console.log('\n=== Scenario 1: Moderate Risk Workflow ===');
  const quote1 = await request('/quotations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` },
    body: JSON.stringify({
      customerId: goldCustomer.id,
      notes: 'Test Moderate Risk Quotation',
      lines: [
        {
          productId: hwProduct.id,
          quantity: 1,
          discountPercent: 17
        }
      ]
    })
  });
  console.log('Created Quotation 1:', quote1.quotation.quotationNumber, 'ID:', quote1.quotation.id);

  const submit1 = await request(`/quotations/${quote1.quotation.id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Submitted Quotation 1:', submit1);

  const detail1 = await request(`/quotations/${quote1.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Quotation 1 Status:', detail1.quotation.status);
  console.log('Quotation 1 Risk Band:', detail1.quotation.riskBand, 'Risk Score:', detail1.quotation.riskScore);
  const steps1 = detail1.quotation.approvals?.[0]?.steps || [];
  console.log('Quotation 1 Steps count:', steps1.length, steps1.map(s => `${s.stepOrder}: ${s.role?.code} (${s.status})`));

  // Sales Manager approves
  console.log('Sales Manager approving Step 1...');
  const approve1 = await request(`/approvals/steps/${steps1[0].id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({ reason: 'Approved moderate discount' })
  });
  console.log('Approve 1 response: cycleCompleted =', approve1.cycleCompleted, 'quotationStatus =', approve1.quotationStatus);

  const verify1 = await request(`/quotations/${quote1.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Quotation 1 Final Status:', verify1.quotation.status);
  if (verify1.quotation.status !== 'APPROVED') {
    throw new Error(`Expected APPROVED, got ${verify1.quotation.status}`);
  }
  console.log('✓ SCENARIO 1 PASSED: Moderate risk approved by Sales Manager directly -> APPROVED');

  // ==========================================
  // SCENARIO 2: HIGH RISK ESCALATION
  // Discount over ceiling by large amount (e.g. 35% vs 15% ceiling)
  // Expected:
  // - Routing requires Sales Manager + Finance Manager
  // - Sales Manager approves -> Quotation stays PENDING_APPROVAL
  // - Finance Manager approves -> Quotation becomes APPROVED
  // ==========================================
  console.log('\n=== Scenario 2: High Risk Escalation Workflow ===');
  const quote2 = await request('/quotations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` },
    body: JSON.stringify({
      customerId: goldCustomer.id,
      notes: 'Test High Risk Quotation',
      lines: [
        {
          productId: hwProduct.id,
          quantity: 2,
          discountPercent: 35
        }
      ]
    })
  });
  console.log('Created Quotation 2:', quote2.quotation.quotationNumber, 'ID:', quote2.quotation.id);

  const submit2 = await request(`/quotations/${quote2.quotation.id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Submitted Quotation 2:', submit2);

  const detail2 = await request(`/quotations/${quote2.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Quotation 2 Status:', detail2.quotation.status);
  console.log('Quotation 2 Risk Band:', detail2.quotation.riskBand, 'Risk Score:', detail2.quotation.riskScore);
  const steps2 = detail2.quotation.approvals?.[0]?.steps || [];
  console.log('Quotation 2 Steps count:', steps2.length, steps2.map(s => `${s.stepOrder}: ${s.role?.code} (${s.status})`));

  if (steps2.length < 2) {
    throw new Error(`Expected at least 2 steps for High Risk, got ${steps2.length}`);
  }

  // Step 1: Sales Manager approves
  console.log('Sales Manager approving Step 1 (of 2)...');
  const approve2_mgr = await request(`/approvals/steps/${steps2[0].id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({ reason: 'Sales manager endorsement for strategic deal' })
  });
  console.log('Sales Manager approve response: cycleCompleted =', approve2_mgr.cycleCompleted, 'quotationStatus =', approve2_mgr.quotationStatus);

  const verify2_mid = await request(`/quotations/${quote2.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Quotation 2 Status after Manager approval:', verify2_mid.quotation.status);
  if (verify2_mid.quotation.status !== 'PENDING_APPROVAL') {
    throw new Error(`Expected PENDING_APPROVAL after manager approval on high risk, got ${verify2_mid.quotation.status}`);
  }
  console.log('✓ Verified: Sales manager approval escalated quotation to Finance');

  // Step 2: Finance Manager approves
  console.log('Finance Manager approving Step 2...');
  const approve2_fin = await request(`/approvals/steps/${steps2[1].id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${finToken}` },
    body: JSON.stringify({ reason: 'Finance signoff on commercial margin exceptions' })
  });
  console.log('Finance approve response: cycleCompleted =', approve2_fin.cycleCompleted, 'quotationStatus =', approve2_fin.quotationStatus);

  const verify2_final = await request(`/quotations/${quote2.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Quotation 2 Status after Finance approval:', verify2_final.quotation.status);
  if (verify2_final.quotation.status !== 'APPROVED') {
    throw new Error(`Expected APPROVED after Finance approval, got ${verify2_final.quotation.status}`);
  }
  console.log('✓ SCENARIO 2 PASSED: High risk deal successfully escalated through Sales Manager -> Finance -> APPROVED');

  // ==========================================
  // SCENARIO 3: REJECTION & RE-NEGOTIATION
  // Sales Manager rejects quotation
  // Expected:
  // - Quotation status becomes REJECTED
  // - Lines remain editable
  // - Rep adjusts discount and re-submits
  // ==========================================
  console.log('\n=== Scenario 3: Rejection & Re-negotiation Workflow ===');
  const quote3 = await request('/quotations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` },
    body: JSON.stringify({
      customerId: goldCustomer.id,
      notes: 'Test Rejection Quotation',
      lines: [
        {
          productId: hwProduct.id,
          quantity: 1,
          discountPercent: 20
        }
      ]
    })
  });
  console.log('Created Quotation 3:', quote3.quotation.quotationNumber, 'ID:', quote3.quotation.id);

  await request(`/quotations/${quote3.quotation.id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` }
  });

  const detail3 = await request(`/quotations/${quote3.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  const step3 = detail3.quotation.approvals?.[0]?.steps?.[0];

  console.log('Sales Manager rejecting Quotation 3 with reason...');
  const rejectRes = await request(`/approvals/steps/${step3.id}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({ reason: 'Discount exceeds unit economics. Cap at 10% or negotiate higher volume.' })
  });
  console.log('Reject response:', rejectRes);

  const verify3_rej = await request(`/quotations/${quote3.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Quotation 3 Status after rejection:', verify3_rej.quotation.status);
  if (verify3_rej.quotation.status !== 'REJECTED') {
    throw new Error(`Expected REJECTED, got ${verify3_rej.quotation.status}`);
  }
  console.log('✓ Quotation status successfully set to REJECTED');

  // Rep adjusts discount to 10% (within ceiling of 15%)
  console.log('Sales Rep renegotiates: updating line discount from 20% to 10%...');
  const lineToUpdate = verify3_rej.quotation.lines[0];
  const patchRes = await request(`/quotations/${quote3.quotation.id}/lines/${lineToUpdate.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${repToken}` },
    body: JSON.stringify({ discountPercent: 10 })
  });
  console.log('Line updated: discountPercent =', patchRes.quotation.lines[0].discountPercent);

  // Rep re-confirms quotation
  console.log('Sales Rep re-submitting quotation after renegotiation...');
  const resubmitRes = await request(`/quotations/${quote3.quotation.id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Re-submit response: autoApproved =', resubmitRes.autoApproved, 'status =', resubmitRes.quotation?.status);

  const verify3_final = await request(`/quotations/${quote3.quotation.id}`, {
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Quotation 3 Final Status after renegotiation:', verify3_final.quotation.status);
  if (verify3_final.quotation.status !== 'APPROVED') {
    throw new Error(`Expected APPROVED after renegotiated discount within ceiling, got ${verify3_final.quotation.status}`);
  }
  console.log('✓ SCENARIO 3 PASSED: Quotation rejected -> renegotiated by sales rep -> successfully re-evaluated and APPROVED');

  // ==========================================
  // SCENARIO 4: ORDER CONFIRMATION & DOWNSTREAM
  // Customer accepts / Sales rep confirms to order
  // ==========================================
  console.log('\n=== Scenario 4: Downstream Order Generation ===');
  const confirmOrderRes = await request(`/orders/${verify3_final.quotation.id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${repToken}` }
  });
  console.log('Order created:', confirmOrderRes.order?.orderNumber, 'Status:', confirmOrderRes.order?.status);
  console.log('✓ SCENARIO 4 PASSED: Approved quotation successfully confirmed to Sales Order');

  console.log('\n=============================================');
  console.log('🎉 ALL USER SCENARIOS PASSED WITH 100% SUCCESS');
  console.log('=============================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
