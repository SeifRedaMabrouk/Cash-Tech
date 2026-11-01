'use client';
import { useState, useEffect, type ReactNode } from 'react';
import { Plus, Save, Upload, ArrowLeft } from 'lucide-react';
import {
  type Product,
  type Settings,
  defaults,
  money,
  sampleProducts,
  normalizeDigits,
  normalizePhone,
  cairoLocalToIso,
  isoToCairoLocal,
} from '../lib/domain';
import { useStore } from './store-context';
const blank = (): Product => ({
  id: crypto.randomUUID(),
  name: '',
  category: 'موبايلات',
  brand: '',
  description: '',
  specs: '',
  images: [],
  price: null,
  oldPrice: null,
  available: true,
  hidden: false,
  sample: false,
  featured: false,
  version: 1,
});
// Number input that accepts Arabic digits (١٢٣) and keeps what the owner typed while it is incomplete ("15.").
function NumberField({
  label,
  value,
  onChange,
  scale = 1,
  allowEmpty = false,
  allowNegative = false,
  integer = false,
  required = false,
  placeholder,
}: {
  label: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  scale?: number;
  allowEmpty?: boolean;
  allowNegative?: boolean;
  integer?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const shown = value === null || Number.isNaN(value) ? '' : String(value / scale);
  const [text, setText] = useState(shown);
  const parse = (t: string): number | null => {
    if (t === '' || t === '-' || t === '.') return allowEmpty ? null : NaN;
    const n = Number(t);
    if (!Number.isFinite(n)) return NaN;
    return scale === 1 ? (integer ? Math.round(n) : n) : Math.round(n * scale);
  };
  useEffect(() => {
    const parsed = parse(text);
    if (!(parsed === value || (Number.isNaN(parsed) && Number.isNaN(value)))) setText(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode={allowNegative ? 'text' : 'decimal'}
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          let t = normalizeDigits(e.target.value).replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, '');
          if (allowNegative) t = t.replace(/(?!^)-/g, '');
          const [whole, ...rest] = t.split('.');
          t = rest.length && !integer ? `${whole}.${rest.join('')}` : whole;
          setText(t);
          onChange(parse(t));
        }}
      />
    </label>
  );
}
async function shrinkImage(file: File): Promise<File> {
  // iPhone photos (HEIC) and other formats are converted in the browser when it can read them.
  const convertible = /^image\/(png|jpeg|webp)$/.test(file.type);
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (convertible && scale === 1 && file.size < 400000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp' || (convertible && blob.size >= file.size)) return file;
    return new File([blob], 'image.webp', { type: 'image/webp' });
  } catch {
    return file;
  }
}
export function Admin() {
  const { reload } = useStore();
  const [tab, setTab] = useState('products'),
    [products, setProducts] = useState<Product[]>([]),
    [settings, setSettings] = useState<Settings>(defaults),
    [version, setVersion] = useState(0),
    [edit, setEdit] = useState<Product | null>(null),
    [creating, setCreating] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [a, b] = await Promise.all([fetch('/api/admin/products'), fetch('/api/admin/settings')]);
      const [p, s] = (await Promise.all([a.json(), b.json()])) as [
        Product[] & { error?: string },
        { data: Settings; version: number; error?: string },
      ];
      if (!a.ok || !b.ok) throw new Error(p.error || s.error);
      setProducts(p);
      setSettings(s.data);
      setVersion(s.version);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function call(path: string, method: string, data: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; url: string };
      if (r.status === 401)
        throw new Error('انتهت جلسة الدخول (كل ٨ ساعات). افتح /admin في تبويب جديد وسجّل الدخول، ثم ارجع هنا واضغط حفظ مرة أخرى.');
      if (!r.ok) throw new Error(d.error || 'تعذر الحفظ الآن. حاول مرة أخرى.');
      setMessage('تم الحفظ بنجاح');
      await Promise.all([load(), reload()]);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function update<K extends keyof Product>(k: K, v: Product[K]) {
    setEdit((p) => (p ? { ...p, [k]: v } : p));
  }
  async function upload(original: File) {
    setBusy(true);
    setError('');
    try {
      const file = await shrinkImage(original);
      const r = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; url: string };
      if (!r.ok) throw new Error(d.error || 'تعذر رفع الصورة. استخدم صورة JPG أو PNG أو WebP.');
      setEdit((p) =>
        p
          ? {
              ...p,
              images: p.images.every((x) => x.startsWith('/assets/'))
                ? [d.url]
                : [...p.images, d.url].slice(0, 8),
            }
          : p,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <div className="page-heading">
        <div>
          <p className="breadcrumb">لوحة التحكم / {settings.name}</p>
          <h1>إدارة المتجر</h1>
          <p>المنتجات والخدمات وبيانات المحل، من مكان واحد.</p>
        </div>
        <button
          className="text-button"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.assign('/admin');
          }}
        >
          تسجيل الخروج
        </button>
      </div>
      <div className="admin-shell">
        <aside className="admin-nav">
          {[
            ['products', 'المنتجات والعروض'],
            ['services', 'الخدمات والرسوم'],
            ['store', 'بيانات المحل'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={tab === v ? 'active' : ''}
              onClick={() => {
                setTab(v);
                setEdit(null);
                setMessage('');
                setError('');
              }}
            >
              {l}
            </button>
          ))}
        </aside>
        <section className="admin-panel">
          {message && (
            <div role="status" className="notice">
              {message}
            </div>
          )}
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {tab === 'products' ? (
            <>
              <div className="admin-bar">
                <h2>المنتجات ({products.length})</h2>
                <button
                  className="button"
                  onClick={() => {
                    setEdit(blank());
                    setCreating(true);
                  }}
                >
                  <Plus size={18} />
                  إضافة منتج
                </button>
              </div>
              {edit && (
                <form
                  className="admin-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (edit.images.length === 0) {
                      setError('أضف صورة واحدة على الأقل للمنتج قبل الحفظ');
                      return;
                    }
                    if (await call('/api/admin/products', creating ? 'POST' : 'PUT', edit)) setEdit(null);
                  }}
                >
                  <h3 className="full">{creating ? 'منتج جديد' : 'تعديل المنتج'}</h3>
                  <label>
                    اسم المنتج
                    <input
                      required
                      maxLength={120}
                      value={edit.name}
                      onChange={(e) => update('name', e.target.value)}
                    />
                  </label>
                  <label>
                    الماركة
                    <input
                      required
                      maxLength={60}
                      value={edit.brand}
                      onChange={(e) => update('brand', e.target.value)}
                      list="brands"
                    />
                    <datalist id="brands">
                      {[...new Set(products.map((x) => x.brand))].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </datalist>
                  </label>
                  <label>
                    الفئة
                    <input
                      required
                      maxLength={60}
                      value={edit.category}
                      onChange={(e) => update('category', e.target.value)}
                      list="categories"
                    />
                    <datalist id="categories">
                      {[...new Set(products.map((x) => x.category))].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </datalist>
                  </label>
                  <NumberField
                    label="السعر بالجنيه (فارغ = عند الاستفسار)"
                    value={edit.price}
                    scale={100}
                    allowEmpty
                    onChange={(v) => update('price', v)}
                  />
                  <NumberField
                    label="السعر قبل الخصم بالجنيه (اختياري)"
                    value={edit.oldPrice}
                    scale={100}
                    allowEmpty
                    onChange={(v) => update('oldPrice', v)}
                  />
                  <label>
                    إضافة صورة (حتى ٥ ميجابايت)
                    <input
                      type="file"
                      accept="image/*"
                      disabled={busy || edit.images.length >= 8}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(f);
                      }}
                    />
                  </label>
                  <div className="full">
                    {edit.images.map((src, i) => (
                      <div key={src} className="admin-image">
                        <img src={src} alt={`صورة ${i + 1}`} />
                        {i === 0 && <span>الصورة الرئيسية</span>}
                        <button
                          type="button"
                          disabled={edit.images.length <= 1}
                          onClick={() =>
                            update(
                              'images',
                              edit.images.filter((_, j) => i !== j),
                            )
                          }
                        >
                          إزالة الصورة
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="full">
                    الوصف
                    <textarea
                      maxLength={3000}
                      value={edit.description}
                      onChange={(e) => update('description', e.target.value)}
                    />
                  </label>
                  <label className="full">
                    المواصفات (كل مواصفة في سطر: الاسم: القيمة)
                    <textarea
                      maxLength={4000}
                      value={edit.specs}
                      onChange={(e) => update('specs', e.target.value)}
                    />
                  </label>
                  <div className="checks full">
                    {(
                      [
                        ['available', 'متوفر'],
                        ['hidden', 'مخفي عن الجمهور'],
                        ['sample', 'بيانات تجريبية'],
                        ['featured', 'منتج مميز'],
                      ] as const
                    ).map(([k, l]) => (
                      <label key={k}>
                        <input
                          type="checkbox"
                          checked={edit[k]}
                          onChange={(e) => update(k, e.target.checked)}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                  <div className="actions full">
                    <button className="button" disabled={busy}>
                      <Save size={17} />
                      حفظ المنتج
                    </button>
                    <button type="button" className="text-button" onClick={() => setEdit(null)}>
                      إلغاء
                    </button>
                  </div>
                </form>
              )}
              {products.length === 0 && (
                <div className="notice">
                  <p>لا توجد منتجات. أضف منتجاتك أو ابدأ بأمثلة واضحة كتجربة.</p>
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={async () => {
                      for (const p of sampleProducts) {
                        if (!(await call('/api/admin/products', 'POST', p))) break;
                      }
                    }}
                  >
                    إضافة ٤ منتجات تجريبية
                  </button>
                </div>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>السعر</th>
                      <th>الحالة</th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.name}
                          {p.sample && <p>بيانات تجريبية</p>}
                        </td>
                        <td>{p.price === null ? 'غير محدد' : money(p.price)}</td>
                        <td>{p.hidden ? 'مخفي' : p.available ? 'متوفر' : 'غير متوفر'}</td>
                        <td>
                          <div className="admin-row-actions">
                            <button
                              onClick={() => {
                                setEdit(p);
                                setCreating(false);
                              }}
                            >
                              تعديل
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void call('/api/admin/products', 'PUT', { ...p, hidden: !p.hidden })
                              }
                            >
                              {p.hidden ? 'إظهار' : 'إخفاء'}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                if (confirm(`حذف «${p.name}» نهائيًا؟`))
                                  void call('/api/admin/products', 'DELETE', {
                                    id: p.id,
                                    version: p.version,
                                  });
                              }}
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await call('/api/admin/settings', 'PUT', { data: settings, version });
              }}
            >
              <h2>{tab === 'services' ? 'الخدمات والعمولات والعروض' : 'معلومات المحل والتواصل'}</h2>
              <div className="admin-form">
                {tab === 'services' ? (
                  <>
                    <label>
                      بداية العرض (بتوقيت مصر)
                      <input
                        type="datetime-local"
                        required
                        value={isoToCairoLocal(settings.offerStart)}
                        onChange={(e) => setSettings({ ...settings, offerStart: cairoLocalToIso(e.target.value) })}
                      />
                    </label>
                    <label>
                      نهاية العرض (بتوقيت مصر) — العرض ينتهي في هذه اللحظة
                      <input
                        type="datetime-local"
                        required
                        value={isoToCairoLocal(settings.offerEnd)}
                        onChange={(e) => setSettings({ ...settings, offerEnd: cairoLocalToIso(e.target.value) })}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.offerEnabled}
                        onChange={(e) => setSettings({ ...settings, offerEnabled: e.target.checked })}
                      />
                      تفعيل عرض الافتتاح (لو اتشال، الموقع يعرض الرسوم العادية فقط)
                    </label>
                    <label>
                      تقريب العمولة
                      <select
                        value={settings.rounding}
                        onChange={(e) =>
                          setSettings({ ...settings, rounding: e.target.value as 'ceil' | 'nearest' })
                        }
                      >
                        <option value="ceil">لأعلى جنيه صحيح</option>
                        <option value="nearest">لأقرب جنيه صحيح</option>
                      </select>
                    </label>
                    {settings.services.map((x, i) => (
                      <div className="admin-settings-service full" key={x.id}>
                        <h3>{x.name}</h3>
                        <label>
                          اسم الخدمة
                          <input
                            required
                            value={x.name}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                services: settings.services.map((a, j) =>
                                  j === i ? { ...a, name: e.target.value } : a,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={x.enabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                services: settings.services.map((a, j) =>
                                  j === i ? { ...a, enabled: e.target.checked } : a,
                                ),
                              })
                            }
                          />
                          الخدمة مفعّلة
                        </label>
                        {(['normal', 'offer'] as const).map((k) => (
                          <NumberField
                            key={k}
                            label={`${k === 'normal' ? 'الرسوم العادية' : 'رسوم العرض'} لكل ألف (جنيه)`}
                            value={x[k]}
                            integer
                            required
                            onChange={(v) =>
                              setSettings({
                                ...settings,
                                services: settings.services.map((a, j) =>
                                  j === i ? { ...a, [k]: v ?? NaN } : a,
                                ),
                              })
                            }
                          />
                        ))}
                        <label className="full">
                          وصف الخدمة
                          <textarea
                            value={x.description}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                services: settings.services.map((a, j) =>
                                  j === i ? { ...a, description: e.target.value } : a,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <label>
                      اسم المحل (يظهر في الموقع ورسائل واتساب)
                      <input
                        required
                        maxLength={80}
                        value={settings.name}
                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                      />
                    </label>
                    <label>
                      الاسم بالإنجليزي تحت الشعار (اختياري)
                      <input
                        maxLength={40}
                        dir="ltr"
                        value={settings.nameEn}
                        onChange={(e) => setSettings({ ...settings, nameEn: e.target.value })}
                      />
                    </label>
                    <label>
                      رقم واتساب (مثل 01001234567)
                      <input
                        required
                        dir="ltr"
                        inputMode="tel"
                        value={settings.phone}
                        onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                        onBlur={(e) => setSettings({ ...settings, phone: String(normalizePhone(e.target.value)) })}
                      />
                    </label>
                    <label>
                      البريد الإلكتروني
                      <input
                        required
                        type="email"
                        dir="ltr"
                        value={settings.email}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      />
                    </label>
                    {(
                      [
                        ['address', 'العنوان', 400],
                        ['hours', 'مواعيد العمل (عدّلها بعد يوم الافتتاح لو فيها استثناءات)', 300],
                      ] as const
                    ).map(([k, l, max]) => (
                      <label key={k} className="full">
                        {l}
                        <textarea
                          required
                          maxLength={max}
                          value={settings[k]}
                          onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
                        />
                      </label>
                    ))}
                    {(
                      [
                        ['facebook', 'رابط فيسبوك'],
                        ['instagram', 'رابط إنستجرام'],
                        ['tiktok', 'رابط تيك توك'],
                      ] as const
                    ).map(([k, l]) => (
                      <label key={k}>
                        {l}
                        <input
                          placeholder="اتركه فاضي لو مفيش حساب"
                          dir="ltr"
                          inputMode="url"
                          value={settings[k]}
                          onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
                        />
                      </label>
                    ))}
                    <NumberField
                      label="خط العرض (من خرائط Google)"
                      value={settings.latitude}
                      allowNegative
                      required
                      onChange={(v) => setSettings({ ...settings, latitude: v ?? NaN })}
                    />
                    <NumberField
                      label="خط الطول (من خرائط Google)"
                      value={settings.longitude}
                      allowNegative
                      required
                      onChange={(v) => setSettings({ ...settings, longitude: v ?? NaN })}
                    />
                  </>
                )}
                <button className="button full" disabled={busy}>
                  <Save size={18} />
                  حفظ الإعدادات
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
