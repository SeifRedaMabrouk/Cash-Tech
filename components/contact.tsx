'use client';
import { MapPin, Clock, Phone, Mail, ArrowUpLeft, MessageCircle } from 'lucide-react';
import { useStore } from './store-context';
import { whatsapp, offerState, openingDay, offerDates } from '../lib/domain';
export function Contact() {
  const { settings: s, serverNow } = useStore();
  const state = offerState(s, serverNow || Date.now());
  return (
    <div className="container page">
      <div className="page-heading">
        <div>
          <p className="breadcrumb">الرئيسية / تواصل معنا</p>
          <h1>قريبين منك.</h1>
          <p>كل طرق التواصل مع {s.name}، في مكان واحد.</p>
        </div>
      </div>
      <div className="contact-grid">
        <div className="contact-info">
          <div>
            <MapPin />
            <h2>عنوان المحل</h2>
            <p>{s.address}</p>
          </div>
          <div>
            <Clock />
            <h2>مواعيدنا</h2>
            <p>{s.hours}</p>
            {state === 'upcoming' && <p className="blue">الافتتاح {openingDay(s)}</p>}
            {state === 'active' && <p className="blue">عرض الافتتاح شغّال: {offerDates(s)}</p>}
          </div>
          <div>
            <Phone />
            <h2>تواصل مباشر</h2>
            <a dir="ltr" href={`tel:+${s.phone}`}>
              +{s.phone}
            </a>
            <a href={`mailto:${s.email}`}>{s.email}</a>
          </div>
          <a
            className="button"
            href={whatsapp(s.phone, `مرحبًا ${s.name}، لدي استفسار`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={20} />
            كلّمنا على واتساب
          </a>
          <div className="social-links">
            {[
              ['فيسبوك', s.facebook],
              ['إنستجرام', s.instagram],
              ['تيك توك', s.tiktok],
            ]
              .filter(([, url]) => url)
              .map(([label, url]) => (
              <a href={url} key={label} target="_blank" rel="noopener noreferrer">
                {label}
                <ArrowUpLeft size={17} />
              </a>
            ))}
          </div>
        </div>
        <div className="map-panel">
          <iframe
            title={`موقع ${s.name} على الخريطة`}
            src={`https://maps.google.com/maps?q=${s.latitude},${s.longitude}&z=17&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <a
            className="button outline"
            href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            افتح الاتجاهات في خرائط Google <ArrowUpLeft size={18} />
          </a>
        </div>
      </div>
    </div>
  );
}
