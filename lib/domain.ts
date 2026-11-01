import { z } from 'zod';
export const serviceIds = [
  'wallet-withdraw',
  'wallet-deposit',
  'instapay-withdraw',
  'instapay-deposit',
] as const;
const imagePath = z.string().regex(/^\/(assets\/[\w.-]+|api\/media\/[\w.-]+)$/);
export const productSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    name: z.string().trim().min(2).max(120),
    brand: z.string().trim().min(1).max(60),
    category: z.string().trim().min(1).max(60),
    description: z.string().max(3000),
    specs: z.string().max(4000),
    images: z.array(imagePath).min(1).max(8),
    price: z.number().int().min(0).max(100000000).nullable(),
    oldPrice: z.number().int().min(0).max(100000000).nullable(),
    available: z.boolean(),
    hidden: z.boolean(),
    sample: z.boolean(),
    featured: z.boolean(),
    version: z.number().int().positive(),
  })
  .refine((p) => p.oldPrice === null || (p.price !== null && p.oldPrice > p.price), {
    message: 'السعر السابق يجب أن يكون أكبر من السعر الحالي',
  });
export type Product = z.infer<typeof productSchema>;
// Accepts the usual public link variants people copy from phones (m., web., fb.com, vm.tiktok.com ...).
const socialHosts: Record<string, string[]> = {
  'facebook.com': ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'mbasic.facebook.com', 'fb.com', 'www.fb.com', 'fb.me'],
  'instagram.com': ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
  'tiktok.com': ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
};
export function normalizeUrl(value: unknown) {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v && !/^[a-z]+:\/\//i.test(v) ? 'https://' + v : v.replace(/^http:\/\//i, 'https://');
}
const social = (host: string) =>
  z.preprocess(
    normalizeUrl,
    z
      .string()
      .max(500)
      .refine(
        (s) => {
          if (s === '') return true; // optional: no account on this network
          try {
            const u = new URL(s);
            return u.protocol === 'https:' && socialHosts[host].includes(u.hostname.toLowerCase());
          } catch {
            return false;
          }
        },
        { message: 'رابط ' + host + ' غير صحيح. مثال: https://www.' + host + '/اسم-الصفحة' },
      ),
  );
/** Converts Arabic-Indic / Persian digits and Arabic separators to plain ASCII ("١٬٢٣٤٫٥" -> "1234.5"). */
export function normalizeDigits(value: string) {
  return String(value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, '.')
    .replace(/[\u066C,\s\u00A0]/g, '');
}
/** Egyptian numbers may be typed as 01xxxxxxxxx, +20 1xx..., 0020...; stored as 201xxxxxxxxx. */
export function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return value;
  let v = normalizeDigits(value).replace(/[^\d]/g, '');
  if (v.startsWith('00')) v = v.slice(2);
  if (/^01\d{9}$/.test(v)) v = '2' + v;
  return v;
}
export const settingsSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    nameEn: z.string().trim().max(40).default('CASH TECH'),
    phone: z.preprocess(
      normalizePhone,
      z.string().regex(/^201[0125]\d{8}$/, 'رقم واتساب لازم يكون رقم موبايل مصري: يبدأ بـ 20 ثم 01 (١٢ رقم)، مثال 201551943676'),
    ),
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().email()),
    address: z.string().max(400),
    hours: z.string().max(300),
    facebook: social('facebook.com'),
    instagram: social('instagram.com'),
    tiktok: social('tiktok.com'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    offerStart: z.string().datetime({ offset: true }),
    offerEnd: z.string().datetime({ offset: true }),
    offerEnabled: z.boolean(),
    rounding: z.enum(['ceil', 'nearest']),
    services: z
      .array(
        z.object({
          id: z.enum(serviceIds),
          name: z.string().min(2).max(80),
          description: z.string().max(1000),
          normal: z.number().int().min(0).max(1000),
          offer: z.number().int().min(0).max(1000),
          enabled: z.boolean(),
        }),
      )
      .length(4)
      .refine((a) => new Set(a.map((x) => x.id)).size === 4),
  })
  .refine((s) => Date.parse(s.offerEnd) > Date.parse(s.offerStart), {
    message: 'نهاية العرض يجب أن تكون بعد بدايته',
  });
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
  name: 'كاش تيك',
  nameEn: 'CASH TECH',
  phone: '201551943676',
  email: 'info@example.com', // placeholder: set the real contact email from the admin panel
  address: 'شارع حجاج، بجوار مسجد مصطفى جبر، مشتول السوق، الشرقية، مصر، 44611',
  hours:
    'من السبت للخميس: ٩ صباحًا إلى ١ بعد منتصف الليل. الجمعة إجازة، باستثناء جمعة الافتتاح ٦ نوفمبر ٢٠٢٦.',
  facebook: '',
  instagram: '',
  tiktok: '',
  latitude: 30.3575145,
  longitude: 31.3826199,
  offerStart: '2026-11-06T00:00:00+02:00',
  offerEnd: '2026-11-09T00:00:00+02:00',
  offerEnabled: true,
  rounding: 'ceil',
  services: [
    {
      id: 'wallet-withdraw',
      name: 'سحب المحافظ الإلكترونية',
      description: 'سحب من أي محفظة إلكترونية، بغض النظر عن الشركة.',
      normal: 9,
      offer: 8,
      enabled: true,
    },
    {
      id: 'wallet-deposit',
      name: 'إيداع المحافظ الإلكترونية',
      description: 'إيداع لأي محفظة إلكترونية.',
      normal: 3,
      offer: 0,
      enabled: true,
    },
    {
      id: 'instapay-withdraw',
      name: 'سحب InstaPay',
      description: 'استفسر عن سحب InstaPay واحسب صافي المبلغ الذي تستلمه.',
      normal: 5,
      offer: 3,
      enabled: true,
    },
    {
      id: 'instapay-deposit',
      name: 'إيداع InstaPay',
      description: 'احسب رسوم إيداع InstaPay قبل التواصل معنا.',
      normal: 5,
      offer: 3,
      enabled: true,
    },
  ],
};
export const sampleProducts: Product[] = [
  [
    'demo-phone',
    'هاتف أزرق — نموذج تجريبي',
    'موبايلات',
    'ماركة تجريبية أ',
    1250000,
    '/assets/phone.png',
    'ذاكرة: ١٢٨ جيجابايت\nاللون: أزرق\nمواصفات توضيحية غير فعلية',
    true,
  ],
  [
    'demo-headphones',
    'سماعات لاسلكية — نموذج تجريبي',
    'إكسسوارات',
    'ماركة تجريبية ب',
    180000,
    '/assets/headphones.png',
    'اللون: أبيض\nاتصال لاسلكي\nمواصفات توضيحية غير فعلية',
    true,
  ],
  [
    'demo-charger',
    'شاحن سريع — نموذج تجريبي',
    'إكسسوارات',
    'ماركة تجريبية ب',
    45000,
    '/assets/charger.png',
    'اللون: أبيض\nمنفذ USB-C\nمواصفات توضيحية غير فعلية',
    true,
  ],
  [
    'demo-case',
    'جراب حماية — نموذج تجريبي',
    'إكسسوارات',
    'ماركة تجريبية أ',
    25000,
    '/assets/case.png',
    'اللون: أزرق\nمواصفات توضيحية غير فعلية',
    false,
  ],
].map(
  ([id, name, category, brand, price, image, specs, available]) =>
    ({
      id,
      name,
      category,
      brand,
      price,
      oldPrice: null,
      images: [image],
      specs,
      available,
      description:
        'منتج تجريبي لتوضيح شكل المتجر وتجربة السلة. الاسم والصور والسعر والمواصفات والتوفر ليست بيانات بيع فعلية.',
      hidden: false,
      sample: true,
      featured: true,
      version: 1,
    }) as Product,
);
export function offerState(s: Settings, now = Date.now()) {
  return !s.offerEnabled
    ? 'disabled'
    : now < Date.parse(s.offerStart)
      ? 'upcoming'
      : now < Date.parse(s.offerEnd)
        ? 'active'
        : 'ended';
}
/** Calculator errors whose message is safe and meant to be shown to the customer. */
export class QuoteError extends Error {}
export const amountSchema = z
  .string()
  .regex(/^\d{1,7}(\.\d{1,2})?$/)
  .refine((v) => Number(v) > 0 && Number(v) <= 1000000, 'اكتب مبلغًا أكبر من صفر وحتى مليون جنيه');
export function calculate(s: Settings, id: string, rawAmount: string, now = Date.now()) {
  const amount = normalizeDigits(String(rawAmount ?? ''));
  if (/^\d+(\.\d+)?$/.test(amount) && Number(amount) > 1000000)
    throw new QuoteError('أقصى مبلغ في الحاسبة مليون جنيه. للمبالغ الأكبر كلّمنا على واتساب.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)
    throw new QuoteError('اكتب مبلغًا صحيحًا أكبر من صفر.');
  if (Number(amount) > 1000000) throw new QuoteError('أقصى مبلغ في الحاسبة مليون جنيه. للمبالغ الأكبر كلّمنا على واتساب.');
  const service = s.services.find((x) => x.id === id && x.enabled);
  if (!service) throw new QuoteError('الخدمة دي غير متاحة حاليًا.');
  const [whole, decimal = ''] = amount.split('.');
  const amountCents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  const state = offerState(s, now),
    rate = state === 'active' ? service.offer : service.normal;
  const numerator = amountCents * rate;
  const fee =
    s.rounding === 'ceil'
      ? Math.floor((numerator + 99999) / 100000)
      : Math.floor((numerator + 50000) / 100000);
  const feeCents = fee * 100,
    withdraw = id.endsWith('withdraw');
  if (withdraw && feeCents >= amountCents)
    throw new QuoteError('المبلغ ده أقل من أو يساوي العمولة، فالصافي هيبقى صفر. اكتب مبلغًا أكبر.');
  return {
    service: service.name,
    id,
    amountCents,
    feeCents,
    netCents: withdraw ? amountCents - feeCents : amountCents,
    totalCents: withdraw ? amountCents : amountCents + feeCents,
    rate,
    state,
    withdraw,
    computedAt: new Date(now).toISOString(),
  };
}
export type Quote = ReturnType<typeof calculate>;
export function money(cents: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(cents / 100) + ' ج.م';
}
export function whatsapp(phone: string, message: string) {
  if (!/^201[0125]\d{8}$/.test(phone)) throw new Error('رقم غير صالح');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
export function quoteText(q: Quote, shopName = defaults.name) {
  return `مرحبًا ${shopName}، أريد الاستفسار عن ${q.service}\nالمبلغ: ${money(q.amountCents)}\nالرسوم: ${money(q.feeCents)}\n${q.withdraw ? 'صافي الاستلام' : 'إجمالي المطلوب'}: ${money(q.withdraw ? q.netCents : q.totalCents)}\nالتسعير: ${q.state === 'active' ? 'عرض الافتتاح' : 'السعر العادي'}\nحُسب في: ${formatCairoDateTime(q.computedAt)} بتوقيت مصر\nيرجى تأكيد التفاصيل قبل التنفيذ.`;
}
export function isAdminId(id: string | undefined | null, allowed: string | undefined) {
  return (
    !!id &&
    !!allowed &&
    allowed
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .includes(id)
  );
}

export function offerDates(s: Settings) {
  const f = new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Cairo',
  });
  return `${f.format(new Date(s.offerStart))} — ${f.format(new Date(Date.parse(s.offerEnd) - 1))}`;
}

const CAIRO = 'Africa/Cairo';
/** Arabic, human-readable Cairo time, e.g. "١ نوفمبر ٢٠٢٦، ٤:٣٠ م". */
export function formatCairoDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: CAIRO,
  }).format(new Date(value));
}
function cairoParts(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}
function cairoOffsetMinutes(ms: number) {
  const p = cairoParts(ms);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
}
const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
/** "2026-11-06T00:00" typed as Cairo wall time -> "2026-11-06T00:00:00+02:00" (handles Egyptian summer time). */
export function cairoLocalToIso(local: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return '';
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let offset = cairoOffsetMinutes(wall - 2 * 3600000);
  offset = cairoOffsetMinutes(wall - offset * 60000);
  const sign = offset >= 0 ? '+' : '-';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}
/** ISO instant -> "YYYY-MM-DDTHH:mm" in Cairo time, for <input type="datetime-local">. */
export function isoToCairoLocal(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const p = cairoParts(ms);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}
/** "الجمعة ٦ نوفمبر ٢٠٢٦" for the offer start (the opening day). */
export function openingDay(s: Settings) {
  return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: CAIRO }).format(
    new Date(s.offerStart),
  );
}
/** Arabic-Indic digits, matching how prices are shown. */
export function num(n: number) {
  return new Intl.NumberFormat('ar-EG').format(n);
}
/** "منتج واحد" / "منتجان" / "٣ منتجات" / "١١ منتجًا". */
export function productCount(n: number) {
  if (n === 0) return 'لا توجد منتجات';
  if (n === 1) return 'منتج واحد';
  if (n === 2) return 'منتجان';
  return `${num(n)} ${n <= 10 ? 'منتجات' : 'منتجًا'}`;
}
