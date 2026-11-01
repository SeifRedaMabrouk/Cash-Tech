import { getAuthenticatedAdmin } from '../server/identity';
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function requireAdmin(request?: Request) {
  const user = await getAuthenticatedAdmin();
  if (!user) throw new HttpError(401, 'يلزم تسجيل الدخول');
  if (request && request.method !== 'GET') {
    const origin = request.headers.get('origin');
    const expected = new URL(request.url).origin;
    if (!origin || origin !== expected)
      throw new HttpError(403, `طلب غير مسموح. افتح لوحة الإدارة من العنوان الرسمي للموقع: ${expected}/admin`);
  }
  return user;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
export function safeError(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.name === 'ZodError')
    return json({ error: validationMessage((error as any).issues) }, 400);
  console.error(new Date().toISOString(), 'API error', error);
  return json({ error: 'تعذر إتمام الطلب الآن. حاول مرة أخرى.' }, 503);
}
export async function body(request: Request, max = 32000) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'صيغة الطلب غير مدعومة');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'طلب فارغ');
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, 'حجم البيانات أكبر من المسموح');
    }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    data.set(c, off);
    off += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new HttpError(400, 'طلب غير صالح');
  }
}

// Field-specific Arabic messages so the owner knows exactly which input to fix.
const fieldHelp: Record<string, string> = {
  name: 'الاسم: اكتب حرفين على الأقل.',
  nameEn: 'الاسم بالإنجليزي: حتى ٤٠ حرفًا.',
  brand: 'الماركة مطلوبة (حتى ٦٠ حرفًا).',
  category: 'الفئة مطلوبة (حتى ٦٠ حرفًا).',
  description: 'الوصف أطول من المسموح (٣٠٠٠ حرف).',
  specs: 'المواصفات أطول من المسموح (٤٠٠٠ حرف).',
  images: 'الصور: أضف صورة واحدة على الأقل وحتى ٨ صور.',
  price: 'السعر: اكتب رقمًا من صفر حتى مليون جنيه، أو اتركه فارغًا.',
  oldPrice: 'السعر قبل الخصم: لازم يكون أكبر من السعر الحالي، أو اتركه فارغًا.',
  phone: 'رقم واتساب: اكتبه مثل 01001234567 أو 201001234567.',
  email: 'البريد الإلكتروني غير صحيح.',
  address: 'العنوان أطول من ٤٠٠ حرف.',
  hours: 'مواعيد العمل أطول من ٣٠٠ حرف.',
  facebook: 'رابط فيسبوك غير صحيح. انسخ رابط الصفحة من فيسبوك، مثل https://www.facebook.com/...',
  instagram: 'رابط إنستجرام غير صحيح. مثال: https://www.instagram.com/اسم_الحساب',
  tiktok: 'رابط تيك توك غير صحيح. مثال: https://www.tiktok.com/@اسم_الحساب',
  latitude: 'خط العرض: رقم بين -90 و90.',
  longitude: 'خط الطول: رقم بين -180 و180.',
  offerStart: 'بداية العرض: اختر تاريخًا ووقتًا صحيحين.',
  offerEnd: 'نهاية العرض: اختر تاريخًا ووقتًا صحيحين.',
  quantity: 'الكمية لازم تكون من ١ إلى ٢٠.',
};
export function validationMessage(issues: { path?: PropertyKey[]; message?: string }[] = []) {
  const issue = issues[0];
  if (!issue) return 'راجع البيانات المدخلة وحاول مرة أخرى';
  const path = issue.path ?? [];
  if (issue.message && /[\u0600-\u06FF]/.test(issue.message)) return issue.message;
  if (path[0] === 'services') {
    const n = typeof path[1] === 'number' ? ` رقم ${path[1] + 1}` : '';
    const key = path[2];
    return `الخدمة${n}: ${key === 'name' ? 'اكتب اسمًا من حرفين على الأقل.' : key === 'normal' || key === 'offer' ? 'الرسوم لازم تكون رقمًا صحيحًا من 0 إلى 1000 لكل ألف.' : 'راجع بيانات الخدمة.'}`;
  }
  const key = [...path].reverse().find((k) => typeof k === 'string' && fieldHelp[k as string]) as string | undefined;
  return key ? fieldHelp[key] : 'راجع البيانات المدخلة وحاول مرة أخرى';
}
