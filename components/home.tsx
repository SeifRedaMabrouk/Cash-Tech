'use client';
import Link from 'next/link';
import { ArrowLeft, ArrowUpLeft, Wallet, Smartphone, Headphones } from 'lucide-react';
import { ProductGrid } from './products';
import { Calculator } from './calculator';
import { useStore } from './store-context';
import { offerState, offerDates, money } from '../lib/domain';
export function Home() {
  const { settings, serverNow, products } = useStore();
  const state = offerState(settings, serverNow);
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <h1>
            تكنولوجيا أذكى.
            <br />
            <span>اختيارات أفضل.</span>
          </h1>
          <p>
            اكتشف الموبايلات والإكسسوارات،
            <br />
            واختار اللي يناسبك. طلبك يبدأ على واتساب.
          </p>
          <div className="actions">
            <Link className="button" href="/products">
              تصفح المنتجات <ArrowLeft size={19} />
            </Link>
            <Link className="text-button" href="/services">
              احسب عمولتك <ArrowUpLeft size={18} />
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <img src="/assets/hero.webp" alt="صورة توضيحية لهواتف زرقاء وسماعات لاسلكية" fetchPriority="high" />
          {products.some((p) => p.sample) && <span>صور توضيحية</span>}
        </div>
      </section>
      <div className="container quick-categories">
        <Link href="/products?category=موبايلات">
          <Smartphone />
          <span>موبايلات</span>
          <ArrowUpLeft />
        </Link>
        <Link href="/products?category=إكسسوارات">
          <Headphones />
          <span>إكسسوارات</span>
          <ArrowUpLeft />
        </Link>
        <Link href="/services">
          <Wallet />
          <span>محافظ إلكترونية وInstaPay</span>
          <ArrowUpLeft />
        </Link>
      </div>
      <section className="section container">
        <div className="section-heading">
          <div>
            <h2>منتجات مميزة</h2>
            <p>
              {products.some((p) => p.sample)
                ? 'اكتشف تجربة المتجر بمنتجات توضيحية.'
                : 'اختيارات مميزة من منتجاتنا.'}
            </p>
          </div>
          <Link href="/products" className="text-button">
            عرض كل المنتجات <ArrowLeft size={18} />
          </Link>
        </div>
        <ProductGrid featured />
      </section>
      <section className="service-band">
        <div className="container">
          <div className="section-heading">
            <div>
              <h2>سحب وإيداع. بحساب واضح.</h2>
              <p>من أي محفظة إلكترونية أو عبر InstaPay.</p>
            </div>
            <Link href="/services" className="text-button">
              تفاصيل الخدمات <ArrowLeft size={18} />
            </Link>
          </div>
          {state === 'active' || state === 'upcoming' ? (
            <div className="offer-strip">
              <strong>{state === 'active' ? 'عرض الافتتاح شغّال' : 'مستنيينك في الافتتاح'}</strong>
              <span>{offerDates(settings)} · بتوقيت مصر</span>
              <span>
                {settings.services
                  .filter((x) => x.enabled)
                  .map((x) => `${x.name}: ${x.offer === 0 ? 'مجانًا' : money(x.offer * 100) + ' / ألف'}`)
                  .join(' · ')}{' '}
                خلال العرض
              </span>
            </div>
          ) : (
            <div className="offer-strip">
              <strong>رسوم خدمات {settings.name}</strong>
              <span>
                {settings.services
                  .filter((x) => x.enabled)
                  .map((x) => `${x.name}: ${x.normal === 0 ? 'مجانًا' : money(x.normal * 100) + ' / ألف'}`)
                  .join(' · ')}
              </span>
            </div>
          )}
          <Calculator />
        </div>
      </section>
      <section className="visit-band container">
        <div>
          <h2>اختار أونلاين، وخلّينا نتكلم.</h2>
          <p>ضيف المنتجات للسلة وابعت تفاصيل طلبك على واتساب، أو زورنا في مشتول السوق.</p>
        </div>
        <Link href="/contact" className="button">
          عنوان المحل والتواصل <ArrowUpLeft size={20} />
        </Link>
      </section>
    </>
  );
}
