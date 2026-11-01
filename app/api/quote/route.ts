import { getSettings } from '../../../lib/store';
import { calculate, quoteText, whatsapp, QuoteError } from '../../../lib/domain';
import { body, json, safeError, HttpError } from '../../../lib/security';
export async function POST(req: Request) {
  try {
    const input = (await body(req, 2000)) as any;
    if (!input || typeof input !== 'object') throw new HttpError(400, 'أدخل مبلغًا صالحًا واختر خدمة متاحة.');
    const { data } = await getSettings();
    let quote;
    try {
      quote = calculate(data, input.service, input.amount);
    } catch (err) {
      if (err instanceof QuoteError) throw new HttpError(400, err.message);
      throw new HttpError(400, 'أدخل مبلغًا صالحًا واختر خدمة متاحة. يجب ألا تقل قيمة السحب عن العمولة.');
    }
    return json({ ...quote, url: whatsapp(data.phone, quoteText(quote, data.name)) });
  } catch (e) {
    return safeError(e);
  }
}
