'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, ShoppingBag, ArrowUpLeft, Phone, MessageCircle } from 'lucide-react';
import { useStore } from './store-context';
import { whatsapp, num } from '../lib/domain';
export function Shell({ children }: { children: React.ReactNode }) {
  const { settings: s, cart, products } = useStore(),
    [open, setOpen] = useState(false),
    path = usePathname().replace(/(.)\/+$/, '$1');
  const count = cart.reduce((a, b) => a + b.quantity, 0);
  const hello = `مرحبًا ${s.name}، لدي استفسار`;
  const links = [
    ['/', 'الرئيسية'],
    ['/products', 'المنتجات'],
    ['/services', 'الخدمات والحاسبة'],
    ['/contact', 'تواصل معنا'],
  ];
  return (
    <>
      <a className="skip" href="#main">
        انتقل إلى المحتوى
      </a>
      <div className="topline">
        <span>تكنولوجيا أذكى. اختيارات أفضل.</span>
        {products.some((p) => p.sample) && <span>نسخة تجريبية · المنتجات والأسعار للتوضيح</span>}
      </div>
      <header>
        <div className="header-inner">
          <Link className="brand" href="/" aria-label={`${s.name} الرئيسية`}>
            <span className="logo-crop">
              <img src="/assets/logo.png" alt="" width="158" height="106" />
            </span>
            <span>
              <strong>{s.name}</strong>
              {s.nameEn && <small>{s.nameEn}</small>}
            </span>
          </Link>
          <nav aria-label="القائمة الرئيسية" className={open ? 'open' : ''}>
            {links.map(([url, label]) => (
              <Link
                key={url}
                href={url}
                aria-current={path === url ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Link
              className="cart-link"
              href="/cart"
              aria-label={`سلة الطلبات، ${num(count)} قطعة`}
            >
              <ShoppingBag size={20} />
              <span className="cart-word">السلة</span>
              <b>{num(count)}</b>
            </Link>
            <button
              className="icon-button menu-toggle"
              aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer>
        <div className="footer-grid container">
          <div>
            <h2>
              {s.name}
              {s.nameEn && <span>{s.nameEn}</span>}
            </h2>
            <p>تكنولوجيا أذكى. اختيارات أفضل.</p>
            <p className="muted">موبايلات وإكسسوارات وخدمات المحافظ وInstaPay.</p>
          </div>
          <div>
            <h3>استكشف</h3>
            {links.slice(1).map(([url, label]) => (
              <Link key={url} href={url}>
                {label}
              </Link>
            ))}
          </div>
          <div>
            <h3>زورنا في المحل</h3>
            <p>{s.address}</p>
            <p>{s.hours}</p>
          </div>
          <div>
            <h3>خلّينا على تواصل</h3>
            <a
              href={whatsapp(s.phone, hello)}
              target="_blank"
              rel="noopener noreferrer"
            >
              واتساب <ArrowUpLeft size={15} />
            </a>
            {s.facebook && (
              <a href={s.facebook} target="_blank" rel="noopener noreferrer">
                فيسبوك
              </a>
            )}
            {s.instagram && (
              <a href={s.instagram} target="_blank" rel="noopener noreferrer">
                إنستجرام
              </a>
            )}
            {s.tiktok && (
              <a href={s.tiktok} target="_blank" rel="noopener noreferrer">
                تيك توك
              </a>
            )}
          </div>
        </div>
        <div className="footer-bottom container">
          <span>© {s.name}</span>
          <Link href="/admin">دخول الإدارة</Link>
        </div>
      </footer>
      <a
        className="floating-wa"
        href={whatsapp(s.phone, hello)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصل عبر واتساب"
      >
        <MessageCircle size={25} />
      </a>
    </>
  );
}
