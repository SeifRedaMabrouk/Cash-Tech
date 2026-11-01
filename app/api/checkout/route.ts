import { z } from 'zod';
import { getProducts, getSettings } from '../../../lib/store';
import { money, num, whatsapp } from '../../../lib/domain';
import { body, json, safeError, HttpError } from '../../../lib/security';
export async function POST(req: Request) {
  try {
    const input = z
      .array(z.object({ id: z.string().max(80), quantity: z.number().int().min(1).max(20) }))
      .min(1)
      .max(40)
      .parse(await body(req, 6000));
    if (new Set(input.map((x) => x.id)).size !== input.length) throw new HttpError(400, 'عناصر مكررة');
    const [products, { data: s }] = await Promise.all([getProducts(), getSettings()]);
    const missing = input.filter((item) => !products.some((x) => x.id === item.id && x.available));
    if (missing.length) {
      // Name the products (including hidden ones the customer already has in the cart) so the message is actionable.
      // Hidden products are never named (their name is private to the admin).
      const all = await getProducts(true);
      const names = missing.map((m) => {
        const p = all.find((x) => x.id === m.id);
        return p && !p.hidden ? p.name : 'منتج لم يعد متاحًا';
      });
      return json(
        { error: `غير متوفر حاليًا: ${names.join('، ')}. احذفه من السلة للمتابعة.`, unavailable: missing.map((m) => m.id) },
        409,
      );
    }
    let total = 0;
    let sample = false;
    let unknown = false;
    const lines = input.map((item) => {
      const p = products.find((x) => x.id === item.id)!;
      sample ||= p.sample;
      unknown ||= p.price === null;
      total += (p.price ?? 0) * item.quantity;
      return `${p.name} × ${num(item.quantity)} — ${p.price === null ? 'السعر عند الاستفسار' : money(p.price * item.quantity)}`;
    });
    const text = `مرحبًا ${s.name}، أريد الاستفسار عن هذه السلة:\n${sample ? 'تنبيه: تتضمن هذه السلة بيانات ومنتجات تجريبية وليست طلب بيع فعلي.\n' : ''}${lines.join('\n')}\n${unknown ? 'مجموع الأسعار المعروفة' : 'الإجمالي'}: ${money(total)}\nيرجى تأكيد الأسعار والتوفر قبل الطلب.`;
    return json({ url: whatsapp(s.phone, text), total, sample });
  } catch (e) {
    return safeError(e);
  }
}
