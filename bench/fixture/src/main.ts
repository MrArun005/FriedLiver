import { formatCents } from './format.js';
import { lowStock, totalValueCents, type Item } from './inventory.js';

const items: Item[] = [
  { sku: 'A-1', name: 'Bolt', quantity: 120, priceCents: 15 },
  { sku: 'B-2', name: 'Nut', quantity: 3, priceCents: 10 },
  { sku: 'C-3', name: 'Washer', quantity: 0, priceCents: 5 },
];

console.log(`Stock value: ${formatCents(totalValueCents(items))}`);
console.log(`Low stock: ${lowStock(items).map((i) => i.name).join(', ')}`);
