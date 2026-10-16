export interface Item {
  sku: string;
  name: string;
  quantity: number;
  priceCents: number;
}

export function totalValueCents(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.priceCents, 0);
}

export function lowStock(items: Item[], threshold = 5): Item[] {
  return items.filter((item) => item.quantity < threshold).sort((a, b) => a.quantity - b.quantity);
}
