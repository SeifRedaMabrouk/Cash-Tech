import { env } from '../server/env';
import { defaults, type Product, type Settings, settingsSchema } from './domain';
export function database() {
  if (!env.DB) throw new Error('Storage unavailable');
  return env.DB;
}
export function decodeProduct(row: any): Product {
  return {
    ...row,
    images: JSON.parse(row.images),
    oldPrice: row.old_price,
    available: !!row.available,
    hidden: !!row.hidden,
    sample: !!row.sample,
    featured: !!row.featured,
  };
}
export async function getProducts(admin = false) {
  const result = await database()
    .prepare(`SELECT * FROM products ${admin ? '' : 'WHERE hidden = 0'} ORDER BY featured DESC, name`)
    .all();
  return result.results.map(decodeProduct);
}
export async function getSettings(): Promise<{ data: Settings; version: number }> {
  const row = await database()
    .prepare('SELECT data,version FROM settings WHERE id = ?')
    .bind('store')
    .first<{ data: string; version: number }>();
  return row
    ? { data: settingsSchema.parse(JSON.parse(row.data)), version: row.version }
    : { data: defaults, version: 0 };
}
export function productValues(p: Product) {
  return [
    p.name,
    p.brand,
    p.category,
    p.description,
    p.specs,
    JSON.stringify(p.images),
    p.price,
    p.oldPrice,
    +p.available,
    +p.hidden,
    +p.sample,
    +p.featured,
    new Date().toISOString(),
  ];
}
