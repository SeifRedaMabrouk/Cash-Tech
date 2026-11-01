import { getProducts, getSettings } from '../../../lib/store';
import { json, safeError } from '../../../lib/security';
export async function GET() {
  try {
    const [products, settings] = await Promise.all([getProducts(), getSettings()]);
    return json({ products, settings: settings.data, serverNow: Date.now() });
  } catch (e) {
    return safeError(e);
  }
}
