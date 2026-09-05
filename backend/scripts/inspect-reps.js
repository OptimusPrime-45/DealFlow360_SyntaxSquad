import { prisma } from '../lib/prisma.js';

async function main() {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { email: 'asc' },
  });
  console.log('--- USERS ---');
  for (const u of users) {
    console.log(`[${u.role.code}] ${u.email} | ${u.fullName} | ID: ${u.id}`);
  }

  const quotes = await prisma.quotation.findMany({
    include: {
      salesRep: { select: { email: true, fullName: true } },
      customer: { select: { name: true } },
    },
    orderBy: { quotationNumber: 'asc' },
  });
  console.log('\n--- QUOTATIONS ---');
  for (const q of quotes) {
    console.log(`${q.quotationNumber} (${q.status}): Rep=${q.salesRep?.fullName} <${q.salesRep?.email}> (RepId: ${q.salesRepId}), Customer=${q.customer?.name}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
