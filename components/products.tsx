'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { ArrowLeft, Search, SlidersHorizontal, ShoppingBag, Check, MessageCircle } from 'lucide-react';
import { useStore } from './store-context';
import { money, whatsapp, normalizeDigits, productCount, type Product } from '../lib/domain';
// Loose Arabic matching so a link like ?category=اكسسوارات still finds "إكسسوارات".
const norm = (v: string) =>
  v.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
// Demo products share one picture sheet; one small file is downloaded once instead of four large ones.
const DEMO_SHEET = '/assets/demo-products.webp';
export function ProductImage({ product: p, index = 0 }: { product: Product; index?: number }) {
  const src = p.images[index] ?? p.images[0];
  const atlas = /^\/assets\/(phone|headphones|charger|case)\.png$/.test(src);
  return (
    <div className={`product-image ${atlas ? 'atlas ' + src.split('/').pop()!.split('.')[0] : ''}`}>
      <img src={atlas ? DEMO_SHEET : src} alt={p.sample ? 'صورة توضيحية: ' + p.name : p.name} loading="lazy" />
    </div>
  );
}
export function ProductCard({ product: p }: { product: Product }) {
  const { cart, setQuantity } = useStore();
  const [added, setAdded] = useState(false);
  return (
    <article className="product-card">
      <Link href={`/products/${p.id}`} tabIndex={-1}>
        <ProductImage product={p} />
      </Link>
      <div className="card-copy">
        <div className="card-meta">
          <span>{p.category}</span>
          {p.sample ? (
            <span className="sample-label">تجريبي</span>
          ) : p.oldPrice ? (
            <span className="sample-label">عرض</span>
          ) : null}
        </div>
        <h3>
          <Link href={`/products/${p.id}`}>{p.name}</Link>
        </h3>
        <div className="price-row">
          <strong>{p.price === null ? 'السعر عند الاستفسار' : money(p.price)}</strong>
          {p.oldPrice !== null && <del>{money(p.oldPrice)}</del>}
        </div>
        <p className={`availability ${p.available ? 'yes' : ''}`}>
          {p.available ? 'متوفر' : 'غير متوفر'}
          {p.sample ? ' · حالة وسعر تجريبيان' : ''}
        </p>
        <div className="card-actions">
          <Link className="button outline" href={`/products/${p.id}`}>
            عرض التفاصيل <ArrowLeft size={16} />
          </Link>
          <button
            className="icon-button add-button"
            disabled={!p.available}
            aria-label={`أضف ${p.name} إلى السلة`}
            onClick={() => {
              setQuantity(p.id, (cart.find((x) => x.id === p.id)?.quantity ?? 0) + 1);
              setAdded(true);
              setTimeout(() => setAdded(false), 1500);
            }}
          >
            {added ? <Check size={19} /> : <ShoppingBag size={19} />}
          </button>
        </div>
      </div>
    </article>
  );
}
export function ProductGrid({ featured = false }: { featured?: boolean }) {
  const { products, loading, error, reload } = useStore();
  if (loading)
    return (
      <div className="loading" role="status">
        جارٍ تحميل المنتجات…
      </div>
    );
  if (error)
    return (
      <div className="notice error">
        {error}
        <button className="text-button" onClick={() => void reload()}>
          إعادة المحاولة
        </button>
      </div>
    );
  const list = featured ? products.filter((p) => p.featured).slice(0, 4) : products;
  return list.length ? (
    <div className="product-grid">
      {list.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  ) : (
    <div className="empty">لم تُضف منتجات بعد.</div>
  );
}
export function Catalog() {
  const { products, loading, error, reload } = useStore(),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('الكل'),
    [brand, setBrand] = useState('الكل'),
    [sort, setSort] = useState('featured'),
    [min, setMin] = useState(''),
    [max, setMax] = useState(''),
    [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('category');
    if (value) setCategory(value);
  }, []);
  const categories = ['الكل', ...new Set(products.map((p) => p.category))];
  const minValue = Number(min) || 0,
    maxValue = Number(max) || 0;
  const activeFilters = [brand !== 'الكل', !!min, !!max, sort !== 'featured'].filter(Boolean).length;
  const list = products
    .filter(
      (p) =>
        (category === 'الكل' || norm(p.category) === norm(category)) &&
        (brand === 'الكل' || p.brand === brand) &&
        (!search || norm(`${p.name} ${p.brand} ${p.category} ${p.specs}`).includes(norm(search))) &&
        (!minValue || (p.price !== null && p.price >= minValue * 100)) &&
        (!maxValue || (p.price !== null && p.price <= maxValue * 100)),
    )
    .sort((a, b) =>
      sort === 'low'
        ? (a.price ?? Infinity) - (b.price ?? Infinity)
        : sort === 'high'
          ? (b.price ?? -1) - (a.price ?? -1)
          : +b.featured - +a.featured,
    );
  return (
    <div className="container page">
      <div className="page-heading">
        <div>
          <p className="breadcrumb">
            <Link href="/">الرئيسية</Link> / المنتجات
          </p>
          <h1>اختار اللي يناسبك.</h1>
          <p>موبايلات وإكسسوارات، وكل التفاصيل قبل ما تطلب.</p>
        </div>
        {products.some((p) => p.sample) && (
          <span className="sample-label">المنتجات والأسعار بيانات تجريبية</span>
        )}
      </div>
      <div className={`catalog-controls${showFilters ? '' : ' collapsed'}`}>
        <label className="search-field">
          <Search size={20} />
          <input
            aria-label="ابحث عن منتج"
            placeholder="ابحث باسم المنتج أو الماركة…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="filters-toggle"
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={18} />
          {showFilters ? 'إخفاء الفلاتر' : `الفلاتر والترتيب${activeFilters ? ` (${activeFilters})` : ''}`}
        </button>
        <label>
          الماركة
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            {['الكل', ...new Set(products.map((p) => p.brand))].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          من سعر
          <input
            type="text"
            inputMode="decimal"
            placeholder="ج.م"
            value={min}
            onChange={(e) => setMin(normalizeDigits(e.target.value).replace(/[^\d.]/g, ''))}
          />
        </label>
        <label>
          إلى سعر
          <input
            type="text"
            inputMode="decimal"
            placeholder="ج.م"
            value={max}
            onChange={(e) => setMax(normalizeDigits(e.target.value).replace(/[^\d.]/g, ''))}
          />
        </label>
        <label>
          الترتيب
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="featured">المميزة أولًا</option>
            <option value="low">الأقل سعرًا</option>
            <option value="high">الأعلى سعرًا</option>
          </select>
        </label>
      </div>
      <div className="catalog-tabs">
        <div className="chips">
          {categories.map((x) => (
            <button key={x} className={norm(category) === norm(x) ? 'active' : ''} onClick={() => setCategory(x)}>
              {x}
            </button>
          ))}
        </div>
        {!loading && !error && <span className="muted">{productCount(list.length)}</span>}
      </div>
      {loading ? (
        <div className="loading">جارٍ التحميل…</div>
      ) : error ? (
        <div className="notice error" role="alert">
          {error}{' '}
          <button className="text-button" onClick={() => void reload()}>
            إعادة المحاولة
          </button>
        </div>
      ) : list.length ? (
        <div className="product-grid">
          {list.map((p) => (
            <ProductCard product={p} key={p.id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Search />
          <h2>مفيش نتائج مطابقة</h2>
          <p>جرّب كلمة مختلفة أو امسح الفلاتر.</p>
          <button
            className="button"
            onClick={() => {
              setSearch('');
              setCategory('الكل');
              setBrand('الكل');
              setMin('');
              setMax('');
            }}
          >
            مسح الفلاتر
          </button>
        </div>
      )}
    </div>
  );
}
export function ProductDetails({ id }: { id: string }) {
  const { products, settings, loading, cart, setQuantity } = useStore(),
    [index, setIndex] = useState(0),
    [added, setAdded] = useState(false);
  const p = products.find((x) => x.id === id);
  useEffect(() => {
    if (p) document.title = `${p.name} | ${settings.name}`;
  }, [p?.name]);
  if (loading) return <div className="container page loading">جارٍ تحميل المنتج…</div>;
  if (!p)
    return (
      <div className="container page empty">
        <h1>المنتج غير متاح</h1>
        <Link href="/products" className="button">
          العودة للمنتجات
        </Link>
      </div>
    );
  return (
    <div className="container page">
      <p className="breadcrumb">
        <Link href="/products">المنتجات</Link> / {p.name}
      </p>
      <div className="detail-grid">
        <div>
          <ProductImage product={p} index={index} />
          {p.images.length > 1 && (
            <div className="thumbnails">
              {p.images.map((src, i) => (
                <button key={src} onClick={() => setIndex(i)} aria-label={`عرض الصورة ${i + 1}`}>
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="detail-copy">
          {p.sample && (
            <div className="notice">منتج تجريبي · الصور والأسعار والمواصفات والتوفر للتوضيح فقط.</div>
          )}
          <p className="muted">
            {p.category} · {p.brand}
          </p>
          <h1>{p.name}</h1>
          <p>{p.description}</p>
          <div className="detail-price">
            {p.price === null ? 'السعر عند الاستفسار' : money(p.price)}{' '}
            {p.oldPrice !== null && <del>{money(p.oldPrice)}</del>}
          </div>
          <p className={`availability ${p.available ? 'yes' : ''}`}>
            {p.available ? 'متوفر' : 'غير متوفر'}
            {p.sample ? ' — تجريبي' : ''}
          </p>
          <div className="actions">
            <button
              className="button"
              disabled={!p.available}
              onClick={() => {
                setQuantity(p.id, (cart.find((x) => x.id === p.id)?.quantity ?? 0) + 1);
                setAdded(true);
              }}
            >
              <ShoppingBag size={20} />
              {added ? 'تمت الإضافة للسلة' : 'أضف إلى السلة'}
            </button>
            <a
              className="button outline"
              href={whatsapp(
                settings.phone,
                `مرحبًا ${settings.name}، أريد الاستفسار عن ${p.name}\n${window.location.origin}/products/${encodeURIComponent(p.id)}${p.sample ? '\nمنتج تجريبي للتوضيح وليس طلب بيع فعلي.' : ''}`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={20} />
              استفسر عبر واتساب
            </a>
          </div>
          <h2>المواصفات</h2>
          <dl className="spec-list">
            {p.specs
              .split('\n')
              .filter(Boolean)
              .map((x, i) => (
                <div key={i}>
                  <dt>{x.split(':')[0]}</dt>
                  <dd>{x.includes(':') ? x.split(':').slice(1).join(':') : '—'}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
