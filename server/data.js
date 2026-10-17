'use strict';
// All names and records are fabricated for this public demo.
const names = [
  'Alex Morgan', 'Jordan Lee', 'Taylor Brooks', 'Casey Patel',
  'Jamie Parker', 'Riley Bennett', 'Avery Chen', 'Sam Rivera',
  'Quinn Harris', 'Drew Thompson', 'Morgan Ellis', 'Cameron Reid',
  'Skyler Adams', 'Peyton Wilson', 'Harper Singh', 'Reese Johnson',
  'Dakota Kim', 'Emerson Clark', 'Rowan Bailey', 'Finley Davis',
  'Sage Robinson', 'Logan Carter', 'Elliot Blake', 'Kendall Martin'
];
const companies = ['Northstar Studio','Cedar Labs','Harbor Works','Orbit Creative',
  'Bluebird Systems','Pinecone Digital','Acorn Analytics','Silverline Co.'];
const products = ['Dashboard Setup','API Integration','Automation Support',
  'Data Connector','Team License'];
const date = offset => new Date(Date.UTC(2026, 9, 16 - offset)).toISOString().slice(0, 10);

function createSeedState() {
  const customers = names.map((name, i) => ({
    id: i + 1001, name, email: `customer${i + 1}@example.com`,
    company: companies[i % companies.length],
    status: ['active','active','prospect','paused'][i % 4], joinedAt: date(i)
  }));
  const orders = Array.from({length: 56}, (_, i) => ({
    id: i + 3001, customerId: customers[(i * 7) % customers.length].id,
    item: products[i % products.length],
    amount: [79,129,249,399,59,179][i % 6] + (i % 3) * 0.5,
    status: ['paid','paid','pending','paid','refunded'][i % 5],
    createdAt: date(i % 24)
  }));
  return { customers, orders, nextCustomerId: 1025, nextOrderId: 3057 };
}
module.exports = {createSeedState};
