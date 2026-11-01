'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ShoppingBag, Trash2, Plus, Minus, ArrowUpLeft } from 'lucide-react';
import { useStore } from './store-context';
import { ProductImage } from './products';
import { money, num } from '../lib/domain';
export function Cart() {
  const { cart, products, setQuantity, loading, reload, error: loadError } = useStore(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState('');
  const entries = cart.map((x) => ({ ...x, p: products.find((p) => p.id === x.id) }));
  const total = entries.reduce((a, x) => a + (x.p?.price ?? 0) * x.quantity, 0);
  // One click: the WhatsApp tab is opened right away (so phones don't block it), then pointed at the
  // message once the server has re-checked prices and availability.
  async function prepare() {
    const win = window.open('', '_blank');
    setBusy(true);
    setError('');
    setUrl('');
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cart),
      });
      const d = (await r.json()) as { error?: string; url: string };
      if (!r.ok) {
        void reload();
        throw new Error(d.error || 'تعذر مراجعة السلة الآن. حاول مرة أخرى.');
      }
      setUrl(d.url);
      if (win && !win.closed) {
        win.opener = null;
        win.location.href = d.url;
      }
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <div className="page-heading">
        <div>
          <p className="breadcrumb">الرئيسية / السلة</p>
          <h1>سلة طلباتك</h1>
          <p>راجع اختيارك، وابعت التفاصيل على واتساب.</p>
        </div>
      </div>
      {loading ? (
        <div className="loading">جارٍ التحميل…</div>
      ) : loadError && cart.length ? (
        <div className="notice error" role="alert">
          تعذر تحميل المنتجات الآن، وسلتك محفوظة كما هي. تأكد من الاتصال وحاول مرة أخرى.{' '}
          <button className="text-button" onClick={() => void reload()}>
            إعادة المحاولة
          </button>
        </div>
      ) : !cart.length ? (
        <div className="empty">
          <ShoppingBag size={42} />
          <h2>لسه السلة فاضية</h2>
          <p>اختار المنتجات اللي عجبتك وارجع هنا.</p>
          <Link href="/products" className="button">
            تصفح المنتجات
          </Link>
        </div>
      ) : (
        <div className="cart-grid">
          <div>
            {entries.map(({ p, id, quantity }) => (
              <article className="cart-item" key={id}>
                {p && <ProductImage product={p} />}
                <div>
                  <h3>{p?.name ?? 'منتج لم يعد متاحًا'}</h3>
                  <p>{!p ? '—' : p.price != null ? money(p.price) : 'السعر عند الاستفسار'}</p>
                  {p?.sample && <span className="sample-label">بيانات تجريبية</span>}
                  {!p?.available && <p className="error">غير متوفر — احذفه للمتابعة</p>}
                  <div className="quantity">
                    <button
                      aria-label={`تقليل كمية ${p?.name ?? 'المنتج'}`}
                      disabled={quantity <= 1}
                      onClick={() => {
                        setQuantity(id, quantity - 1);
                        setUrl('');
                      }}
                    >
                      <Minus size={16} />
                    </button>
                    <span>{num(quantity)}</span>
                    <button
                      aria-label={`زيادة كمية ${p?.name ?? 'المنتج'}`}
                      disabled={quantity >= 20}
                      onClick={() => {
                        setQuantity(id, quantity + 1);
                        setUrl('');
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <button
                  className="icon-button"
                  aria-label={`حذف ${p?.name ?? 'المنتج'}`}
                  onClick={() => {
                    setQuantity(id, 0);
                    setUrl('');
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </article>
            ))}
          </div>
          <aside className="order-summary">
            <h2>ملخص السلة</h2>
            <div>
              <span>عدد القطع</span>
              <strong>{num(cart.reduce((a, x) => a + x.quantity, 0))}</strong>
            </div>
            <div>
              <span>{entries.some((x) => x.p?.price == null) ? 'مجموع الأسعار المعروفة' : 'الإجمالي'}</span>
              <strong>{money(total)}</strong>
            </div>
            {entries.some((x) => x.p?.sample) && (
              <p className="notice">
                تتضمن السلة منتجات وأسعارًا تجريبية. الرسالة ستوضح أنها ليست طلب بيع فعلي.
              </p>
            )}
            <p className="micro">
              الأسعار والتوفر تُراجع قبل إعداد الرسالة. تأكيد الطلب يتم مع المحل، بدون دفع عبر الموقع.
            </p>
            <button
              className="button"
              onClick={() => void prepare()}
              disabled={busy || entries.some((x) => !x.p?.available)}
            >
              {busy ? 'جارٍ مراجعة السلة…' : 'ابعت الطلب على واتساب'}
            </button>
            {url && (
              <a className="button whatsapp-button" target="_blank" rel="noopener noreferrer" href={url}>
                لو واتساب ما اتفتحش، اضغط هنا <ArrowUpLeft size={18} />
              </a>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
