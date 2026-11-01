import { env } from '../../../../server/env';
import { requireAdmin, json, safeError, HttpError } from '../../../../lib/security';
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const type = req.headers.get('content-type');
    const ext =
      type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : null;
    if (!ext) throw new HttpError(415, 'استخدم JPG أو PNG أو WebP');
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError(400, 'ملف فارغ');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        throw new HttpError(413, 'الحد الأقصى للصورة ٥ ميجابايت');
      }
      chunks.push(r.value);
    }
    const bytes = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    const valid =
      ext === 'png'
        ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        : ext === 'jpg'
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
            new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    if (!valid) throw new HttpError(400, 'ملف الصورة غير صالح');
    if (!env.BUCKET) throw new Error('storage');
    const key = `${crypto.randomUUID()}.${ext}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type! } });
    return json({ url: `/api/media/${key}` });
  } catch (e) {
    return safeError(e);
  }
}
