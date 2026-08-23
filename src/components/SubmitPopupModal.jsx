import { useEffect, useRef, useState } from 'react';
import { FORM_ENDPOINT, SUBMIT_EMAIL } from '../lib/config.js';

const EMPTY = {
  name: '',
  location: '',
  instagram: '',
  date: '',
  startTime: '',
  endTime: '',
  other: '',
};

// Pre-filled mail draft used when the relay can't be reached, so a
// submission is never lost just because a third party is down (or the
// endpoint hasn't been activated yet).
function buildMailto(form) {
  const time = [form.startTime, form.endTime].filter(Boolean).join(' – ');
  const lines = [
    `Pop-up: ${form.name}`,
    `Location: ${form.location || '—'}`,
    `Instagram: ${form.instagram || '—'}`,
    `Date: ${form.date || '—'}`,
    `Time: ${time || '—'}`,
    '',
    'Anything else:',
    form.other || '—',
  ];
  return (
    `mailto:${SUBMIT_EMAIL}` +
    `?subject=${encodeURIComponent(`Pop-up submission: ${form.name}`)}` +
    `&body=${encodeURIComponent(lines.join('\n'))}`
  );
}

export default function SubmitPopupModal({ open, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const firstFieldRef = useRef(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Fresh form every time it opens; focus the first field.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setStatus('idle');
    const id = setTimeout(() => firstFieldRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, [open]);

  // Escape to close, and lock background scroll while the dialog is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: `Pop-up submission: ${form.name}`,
          _captcha: 'false',
          _template: 'table',
          'Pop-up name': form.name,
          Location: form.location,
          Instagram: form.instagram,
          Date: form.date,
          'Start time': form.startTime,
          'End time': form.endTime,
          'Anything else': form.other,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  const labelCls = 'text-[11px] uppercase tracking-[0.06em] text-muted';
  const fieldCls =
    'w-full bg-white border-b border-hair px-1 py-1.5 text-[13px] text-ink ' +
    'focus:outline-none focus:border-ink placeholder:text-faint';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-popup-title"
    >
      {/* Backdrop — click anywhere outside to dismiss. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 cursor-default"
      />

      <div className="relative bg-white border border-hair w-full sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-hair sticky top-0 bg-white">
          <div>
            <h2 id="submit-popup-title" className="text-[14px] font-semibold text-ink">
              Submit a pop-up
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              Tell us what you&apos;re running and we&apos;ll add it to the map.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mr-2 -mt-1 px-2 py-1 text-[20px] leading-none text-ink hover:text-muted"
          >
            ×
          </button>
        </div>

        {status === 'sent' ? (
          <div className="px-5 py-8">
            <p className="text-[14px] text-ink">Thanks — we got it.</p>
            <p className="text-[13px] text-muted mt-2">
              We&apos;ll review it and get it on the map shortly.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 bg-ink text-white text-[13px] font-semibold px-4 py-2"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="px-5 py-4 flex flex-col gap-4">
            {/* Honeypot — bots fill this in, humans never see it. */}
            <input
              type="text"
              name="_honey"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>
                Pop-up name <span className="text-ink">*</span>
              </span>
              <input
                ref={firstFieldRef}
                required
                value={form.name}
                onChange={set('name')}
                placeholder="Béo Béo Bakery"
                className={fieldCls}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Where is it?</span>
              <input
                value={form.location}
                onChange={set('location')}
                placeholder="Venue name or address"
                className={fieldCls}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Instagram</span>
              <input
                value={form.instagram}
                onChange={set('instagram')}
                placeholder="@yourpopup"
                className={fieldCls}
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>Day &amp; time</span>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  aria-label="Date"
                  value={form.date}
                  onChange={set('date')}
                  className={fieldCls + ' flex-1 min-w-[125px]'}
                />
                <input
                  type="time"
                  aria-label="Start time"
                  value={form.startTime}
                  onChange={set('startTime')}
                  className={fieldCls + ' w-[95px]'}
                />
                <span className="text-[13px] text-muted">–</span>
                <input
                  type="time"
                  aria-label="End time"
                  value={form.endTime}
                  onChange={set('endTime')}
                  className={fieldCls + ' w-[95px]'}
                />
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Anything else</span>
              <textarea
                rows={3}
                value={form.other}
                onChange={set('other')}
                placeholder="Recurring schedule, menu, pre-orders…"
                className={fieldCls + ' resize-y'}
              />
            </label>

            {status === 'error' && (
              <p className="text-[12px] text-muted">
                Couldn&apos;t send that automatically.{' '}
                <a href={buildMailto(form)} className="text-ink underline font-semibold">
                  Email it instead
                </a>{' '}
                so nothing is lost.
              </p>
            )}

            <div className="flex items-center gap-4 pt-1">
              <button
                type="submit"
                disabled={status === 'sending' || !form.name.trim()}
                className="bg-ink text-white text-[13px] font-semibold px-4 py-2 disabled:opacity-40"
              >
                {status === 'sending' ? 'Sending…' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
