import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-internal';

function makeToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role.code,
      typ: 'internal',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runTests() {
  console.log('============================================================');
  console.log('Testing Role-Based Quotation Scoping & Access Control');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  const alexRep = await prisma.user.findUnique({
    where: { email: 'rep@dealflow360.com' },
    include: { role: true },
  });
  const arvindRep = await prisma.user.findUnique({
    where: { email: 'arvindpatil.9206@gmail.com' },
    include: { role: true },
  });
  const manager = await prisma.user.findUnique({
    where: { email: 'manager@dealflow360.com' },
    include: { role: true },
  });

  const alexToken = makeToken(alexRep);
  const arvindToken = makeToken(arvindRep);
  const managerToken = makeToken(manager);

  // 1. Sales Rep Alex: GET /api/quotations
  const resAlex = await fetch('http://localhost:4000/api/quotations', {
    headers: { Authorization: `Bearer ${alexToken}` },
  });
  const alexData = await resAlex.json();
  const alexQuotes = alexData.data?.quotations || [];
  assert(resAlex.status === 200, 'Alex (SALES_REP) GET /api/quotations returns 200');
  assert(
    alexQuotes.every((q) => q.salesRepId === alexRep.id),
    `Alex only receives his own quotations (Received ${alexQuotes.length} quotations, all belonging to ${alexRep.fullName})`
  );
  assert(
    alexQuotes.length === 2,
    `Alex has exactly 2 quotations in database (received: ${alexQuotes.map((q) => q.quotationNumber).join(', ')})`
  );

  // 2. Sales Rep Arvind: GET /api/quotations
  const resArvind = await fetch('http://localhost:4000/api/quotations', {
    headers: { Authorization: `Bearer ${arvindToken}` },
  });
  const arvindData = await resArvind.json();
  const arvindQuotes = arvindData.data?.quotations || [];
  assert(resArvind.status === 200, 'Arvind (SALES_REP) GET /api/quotations returns 200');
  assert(
    arvindQuotes.every((q) => q.salesRepId === arvindRep.id),
    `Arvind only receives his own quotations (Received ${arvindQuotes.length} quotations, all belonging to Arvind)`
  );
  assert(
    arvindQuotes.length === 1,
    `Arvind has exactly 1 quotation in database (received: ${arvindQuotes.map((q) => q.quotationNumber).join(', ')})`
  );

  // 3. Manager Sarah: GET /api/quotations
  const resMgr = await fetch('http://localhost:4000/api/quotations', {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const mgrData = await resMgr.json();
  const mgrQuotes = mgrData.data?.quotations || [];
  assert(resMgr.status === 200, 'Sarah (SALES_MANAGER) GET /api/quotations returns 200');
  assert(
    mgrQuotes.length === 11,
    `Sarah sees ALL quotations in the system (Received ${mgrQuotes.length} of 11 quotations)`
  );
  assert(
    mgrQuotes.every((q) => q.salesRep && q.salesRep.fullName && q.salesRep.email),
    'Every quotation returned to Manager includes salesRep details (fullName and email)'
  );

  // 4. Manager Sarah: GET /api/quotations?salesRepId=...
  const resMgrFilter = await fetch(`http://localhost:4000/api/quotations?salesRepId=${alexRep.id}`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const mgrFilterData = await resMgrFilter.json();
  const mgrFilterQuotes = mgrFilterData.data?.quotations || [];
  assert(
    mgrFilterQuotes.length === 2 && mgrFilterQuotes.every((q) => q.salesRepId === alexRep.id),
    `Manager filtering by salesRepId=${alexRep.id} returns only Alex's 2 quotations`
  );

  // 5. Sales Rep Alex: Attempt to GET another rep's quotation by ID
  const arvindQuote = await prisma.quotation.findFirst({
    where: { salesRepId: arvindRep.id },
  });
  const resAlexCrossAccess = await fetch(`http://localhost:4000/api/quotations/${arvindQuote.id}`, {
    headers: { Authorization: `Bearer ${alexToken}` },
  });
  assert(
    resAlexCrossAccess.status === 403,
    `Alex accessing Arvind's quotation (${arvindQuote.quotationNumber}) is rejected with 403 Forbidden`
  );

  // 6. Sales Rep Alex: GET own quotation by ID
  const alexQuote = await prisma.quotation.findFirst({
    where: { salesRepId: alexRep.id },
  });
  const resAlexOwnAccess = await fetch(`http://localhost:4000/api/quotations/${alexQuote.id}`, {
    headers: { Authorization: `Bearer ${alexToken}` },
  });
  assert(
    resAlexOwnAccess.status === 200,
    `Alex accessing own quotation (${alexQuote.quotationNumber}) succeeds with 200 OK`
  );

  // 7. Manager Sarah: GET Arvind's quotation by ID
  const resMgrCrossAccess = await fetch(`http://localhost:4000/api/quotations/${arvindQuote.id}`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  assert(
    resMgrCrossAccess.status === 200,
    `Manager Sarah accessing Arvind's quotation (${arvindQuote.quotationNumber}) succeeds with 200 OK`
  );

  console.log(`\n============================================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
