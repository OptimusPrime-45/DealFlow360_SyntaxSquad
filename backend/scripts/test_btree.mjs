import { BTree, BTreeSearchIndex } from '../../frontend/lib/btree.js';

const items = [
  { id: 1, name: 'Enterprise Laptop Pro 15', sku: 'HW-LAP-15', price: 1200, category: 'Hardware' },
  { id: 2, name: 'Office Monitor 27', sku: 'HW-MON-27', price: 400, category: 'Hardware' },
  { id: 3, name: 'Setup & Deployment Service', sku: 'SRV-DEP-01', price: 200, category: 'Service' },
  { id: 4, name: 'Cloud ERP Monthly SaaS', sku: 'SAS-ERP-MO', price: 50, category: 'Software' },
  { id: 5, name: 'Enterprise Laptop Ultra 14', sku: 'HW-LAP-14', price: 1500, category: 'Hardware' }
];

const index = new BTreeSearchIndex({
  textFields: ['name', 'sku', 'category'],
  numericFields: ['price']
});
index.build(items);

// Test 1: Prefix search
const resLap = index.query({ search: 'lap' });
console.log('Prefix search "lap":', resLap.map(x => x.name));
if (resLap.length !== 2) throw new Error(`Expected 2 items, got ${resLap.length}`);

// Test 2: Multi-token search
const resEntLap = index.query({ search: 'enterprise 14' });
console.log('Multi-token "enterprise 14":', resEntLap.map(x => x.name));
if (resEntLap.length !== 1 || resEntLap[0].id !== 5) throw new Error('Multi-token test failed');

// Test 3: Range query
const resRange = index.query({ ranges: { price: { min: 300, max: 1300 } } });
console.log('Range 300-1300:', resRange.map(x => x.name));
if (resRange.length !== 2) throw new Error('Range test failed');

// Test 4: Combined search + filter
const resCombined = index.query({ search: 'HW', filters: { category: 'Hardware' }, ranges: { price: { min: 1000 } } });
console.log('Combined:', resCombined.map(x => x.name));
if (resCombined.length !== 2) throw new Error('Combined test failed');

console.log('✔ All B-Tree tests passed successfully with 100% precision!');
