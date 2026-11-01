'use client';
import { useStore } from './store-context';
import { Calculator } from './calculator';
import { money, whatsapp, offerDates, offerState } from '../lib/domain';
export function Services() {
  const { settings: s, serverNow } = useStore();
  const offerOn = ['active', 'upcoming'].includes(offerState(s, serverNow || Date.now()));
  return (
    <div className="container page">
      <div className="page-heading">
        <div>
          <p className="breadcrumb">الرئيسية / الخدمات</p>
          <h1>خدماتك المالية، بحساب واضح.</h1>
          <p>سحب وإيداع المحافظ الإلكترونية وInstaPay. احسب الرسوم قبل ما تتواصل.</p>
        </div>
      </div>
      <Calculator />
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>رسوم الخدمات</h2>
            <p>
              {offerOn ? `عرض الافتتاح: ${offerDates(s)}. ` : ''}جميع الرسوم التالية لكل ألف جنيه.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>الخدمة</th>
                {offerOn && <th>خلال العرض</th>}
                <th>{offerOn ? 'السعر العادي' : 'الرسوم'}</th>
                <th>التواصل</th>
              </tr>
            </thead>
            <tbody>
              {s.services.map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong>{x.name}</strong>
                    <p className="muted">{x.description}</p>
                    {!x.enabled && <span className="sample-label">متوقفة حاليًا</span>}
                  </td>
                  {offerOn && <td>{x.offer === 0 ? 'مجانًا' : money(x.offer * 100)}</td>}
                  <td>{x.normal === 0 ? 'مجانًا' : money(x.normal * 100)}</td>
                  <td>
                    {x.enabled ? (
                      <a
                        className="text-button"
                        href={whatsapp(s.phone, `مرحبًا ${s.name}، أريد الاستفسار عن ${x.name}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        استفسر عبر واتساب
                      </a>
                    ) : (
                      'غير متاحة'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="micro">
          الرسوم محسوبة بالتناسب مع المبلغ وتُقرّب{' '}
          {s.rounding === 'ceil' ? 'لأعلى جنيه صحيح' : 'لأقرب جنيه صحيح'}. تُخصم رسوم السحب من المبلغ المستلم،
          وتُضاف رسوم الإيداع إلى المبلغ المطلوب.
        </p>
      </section>
    </div>
  );
}
