import { z } from 'zod';
import { database, getProducts, productValues } from '../../../../lib/store';
import { productSchema } from '../../../../lib/domain';
import { env } from '../../../../server/env';
import { body, requireAdmin, json, safeError, HttpError } from '../../../../lib/security';
const STATIC_IMAGES = new Set(['/assets/hero.webp', '/assets/logo.png', '/assets/demo-products.webp', '/assets/phone.png', '/assets/headphones.png', '/assets/charger.png', '/assets/case.png']);
// Every product image must really exist: a bundled site image or an uploaded file.
async function checkImages(images: string[]) {
  for (const src of images) {
    if (STATIC_IMAGES.has(src)) continue;
    const key = src.startsWith('/api/media/') ? src.slice(11) : '';
    const file = key && /^[a-f0-9-]+\.(png|jpg|webp)$/.test(key) ? await env.BUCKET?.get(key) : null;
    if (!file) throw new HttpError(400, 'صورة غير موجودة. ارفع الصورة من لوحة الإدارة ثم احفظ المنتج.');
  }
}
export async function GET() {
  try {
    await requireAdmin();
    return json(await getProducts(true));
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const p = productSchema.parse(await body(req));
    await checkImages(p.images);
    const db = database();
    const exists = await db.prepare('SELECT id FROM products WHERE id=?').bind(p.id).first();
    if (exists) throw new HttpError(409, 'معرف المنتج موجود بالفعل');
    try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO products(name,brand,category,description,specs,images,price,old_price,available,hidden,sample,featured,updated_at,id,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
        )
        .bind(...productValues(p), p.id),
      db
        .prepare('INSERT INTO audit_log VALUES(?,?,?,?,?)')
        .bind(crypto.randomUUID(), user.userId, 'create', p.id, new Date().toISOString()),
    ]);
    } catch (err) {
      if (/UNIQUE|PRIMARY KEY|constraint/i.test(String((err as Error)?.message))) throw new HttpError(409, 'معرف المنتج موجود بالفعل');
      throw err;
    }
    return json({ ok: true }, 201);
  } catch (e) {
    return safeError(e);
  }
}
export async function PUT(req: Request) {
  try {
    const user = await requireAdmin(req);
    const p = productSchema.parse(await body(req));
    await checkImages(p.images);
    const db = database();
    const result = await db
      .prepare(
        'UPDATE products SET name=?,brand=?,category=?,description=?,specs=?,images=?,price=?,old_price=?,available=?,hidden=?,sample=?,featured=?,updated_at=?,version=version+1 WHERE id=? AND version=?',
      )
      .bind(...productValues(p), p.id, p.version)
      .run();
    if (result.meta.changes !== 1)
      throw new HttpError(409, 'تم تعديل المنتج في جلسة أخرى. أعد تحميل القائمة.');
    await db
      .prepare('INSERT INTO audit_log VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), user.userId, 'update', p.id, new Date().toISOString())
      .run();
    return json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const user = await requireAdmin(req);
    const input = z.object({ id: z.string().max(80), version: z.number().int() }).parse(await body(req));
    const db = database();
    const result = await db
      .prepare('DELETE FROM products WHERE id=? AND version=?')
      .bind(input.id, input.version)
      .run();
    if (result.meta.changes !== 1) throw new HttpError(409, 'تغير المنتج. أعد تحميل القائمة.');
    await db
      .prepare('INSERT INTO audit_log VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), user.userId, 'delete', input.id, new Date().toISOString())
      .run();
    return json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
