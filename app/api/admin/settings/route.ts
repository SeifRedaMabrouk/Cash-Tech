import { database, getSettings } from '../../../../lib/store';
import { settingsSchema } from '../../../../lib/domain';
import { body, requireAdmin, json, safeError, HttpError } from '../../../../lib/security';
export async function GET() {
  try {
    await requireAdmin();
    return json(await getSettings());
  } catch (e) {
    return safeError(e);
  }
}
export async function PUT(req: Request) {
  try {
    const user = await requireAdmin(req);
    const input = (await body(req)) as any;
    if (!input || typeof input !== 'object' || !input.data || typeof input.data !== 'object')
      throw new HttpError(400, 'بيانات الإعدادات ناقصة أو غير صالحة.');
    const data = settingsSchema.parse(input.data);
    const current = await getSettings();
    if (input.version !== current.version) throw new HttpError(409, 'تم تعديل الإعدادات. أعد تحميل الصفحة.');
    const db = database();
    if (current.version === 0) {
      await db
        .prepare('INSERT INTO settings(id,data,version) VALUES(?,?,1)')
        .bind('store', JSON.stringify(data))
        .run();
    } else {
      const r = await db
        .prepare('UPDATE settings SET data=?, version=version+1 WHERE id=? AND version=?')
        .bind(JSON.stringify(data), 'store', current.version)
        .run();
      if (!r.meta.changes) throw new HttpError(409, 'حدث تعديل متزامن. أعد المحاولة.');
    }
    await db
      .prepare('INSERT INTO audit_log VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), user.userId, 'settings', 'store', new Date().toISOString())
      .run();
    return json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
