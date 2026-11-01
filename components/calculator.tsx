'use client';
import { useEffect, useState } from 'react';
import { ArrowUpLeft, Wallet, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useStore } from './store-context';
import { money, offerState, offerDates, normalizeDigits, type Quote } from '../lib/domain';
export function Calculator() {
  const { settings: s, serverNow } = useStore(),
    [kind, setKind] = useState('wallet'),
    [action, setAction] = useState('withdraw'),
    [amount, setAmount] = useState('1000'),
    [quote, setQuote] = useState<(Quote & { url: string }) | null>(null),
    [error, setError] = useState(''),
    [negative, setNegative] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const service = `${kind}-${action}`;
  useEffect(() => {
    const timer = setInterval(() => setRefresh((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setQuote(null);
    setError('');
    if (!amount) {
      setBusy(false);
      return;
    }
    if (!s.services.find((x) => x.id === service)?.enabled) {
      setBusy(false);
      setError('الخدمة دي متوقفة حاليًا. كلّمنا على واتساب للاستفسار.');
      return;
    }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service, amount }),
          signal: controller.signal,
        });
        const data = (await r.json()) as Quote & { url: string; error?: string };
        if (!r.ok) throw new Error(data.error);
        if (alive) setQuote(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'تعذر الحساب');
      } finally {
        if (alive) setBusy(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [service, amount, refresh, s.services]);
  const state = offerState(s, serverNow);
  return (
    <div className="calculator">
      <div className="calculator-form">
        <div className="calculator-title">
          <span className="icon-tile">
            <Wallet />
          </span>
          <div>
            <h2>احسبها قبل ما تيجي</h2>
            <p>كل الرسوم واضحة، من أول خطوة.</p>
          </div>
        </div>
        <fieldset>
          <legend>نوع الخدمة</legend>
          <div className="segmented">
            {[
              ['wallet', 'محافظ إلكترونية'],
              ['instapay', 'InstaPay'],
            ].map(([v, label]) => (
              <button
                type="button"
                key={v}
                className={kind === v ? 'selected' : ''}
                aria-pressed={kind === v}
                onClick={() => setKind(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>نوع العملية</legend>
          <div className="segmented">
            {[
              ['withdraw', 'سحب'],
              ['deposit', 'إيداع'],
            ].map(([v, label]) => (
              <button
                type="button"
                key={v}
                className={action === v ? 'selected' : ''}
                aria-pressed={action === v}
                onClick={() => setAction(v)}
              >
                {v === 'withdraw' ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />} {label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="amount-label" htmlFor="amount">
          المبلغ المطلوب
        </label>
        <div className="amount-input">
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            maxLength={12}
            value={amount}
            onChange={(e) => {
              // Accept Arabic digits (١٢٣) and separators; keep one decimal point.
              const raw = normalizeDigits(e.target.value);
              if (/^\s*[-−]/.test(raw)) {
                setAmount('');
                setNegative(true);
                return;
              }
              setNegative(false);
              const v = raw.replace(/[^\d.]/g, '');
              const [whole, ...rest] = v.split('.');
              setAmount(rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole);
            }}
            placeholder="اكتب المبلغ"
          />
          <span>جنيه مصري</span>
        </div>
      </div>
      <div className="calculator-result" aria-live="polite">
        <span className="result-tag">{quote?.state === 'active' ? 'عرض الافتتاح' : 'حساب الرسوم'}</span>
        <p>{action === 'withdraw' ? 'صافي المبلغ اللي هتستلمه' : 'إجمالي المبلغ اللي هتدفعه'}</p>
        <div className="result-number">
          {quote ? money(action === 'withdraw' ? quote.netCents : quote.totalCents) : busy ? '…' : '—'}
        </div>
        <dl>
          <div>
            <dt>{action === 'withdraw' ? 'مبلغ السحب' : 'مبلغ الإيداع'}</dt>
            <dd>{quote ? money(quote.amountCents) : '—'}</dd>
          </div>
          <div>
            <dt>رسوم الخدمة</dt>
            <dd>{quote ? money(quote.feeCents) : '—'}</dd>
          </div>
          <div>
            <dt>الرسوم لكل ١٬٠٠٠ جنيه</dt>
            <dd>{quote ? money(quote.rate * 100) : '—'}</dd>
          </div>
        </dl>
        {negative && !amount && (
          <p role="alert" className="calc-error">
            المبلغ لازم يكون رقم موجب.
          </p>
        )}
        {error && (
          <p role="alert" className="calc-error">
            {error}
          </p>
        )}
        {quote ? (
          <a className="button white" href={quote.url} target="_blank" rel="noopener noreferrer">
            استفسر عن العملية عبر واتساب <ArrowUpLeft size={19} />
          </a>
        ) : (
          <button className="button white" disabled>
            استفسر عبر واتساب
          </button>
        )}
        <small>
          {state === 'active'
            ? `فترة العرض: ${offerDates(s)} بتوقيت مصر.`
            : state === 'upcoming'
              ? `عرض الافتتاح: ${offerDates(s)}. الأسعار الحالية عادية.`
              : 'الأسعار المعروضة حسب إعدادات الخدمة الحالية.'}
        </small>
      </div>
    </div>
  );
}
