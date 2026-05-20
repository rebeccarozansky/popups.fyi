import { CUSTOM_MAX_DAYS, validateCustomRange } from '../lib/dateFilters.js';

const LABELS = {
  today: 'Today',
  weekend: 'Weekend',
  week: 'This Week',
  custom: 'Custom',
};

const ORDER = ['today', 'weekend', 'week', 'custom'];

export default function FilterChips({ value, onChange, customRange, onCustomRangeChange }) {
  return (
    <>
      <nav
        className="h-12 border-b border-hair bg-white flex items-stretch px-5 gap-5 relative z-20"
        aria-label="Filter pop-ups by date"
      >
        {ORDER.map((key) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={
                'relative h-full text-[13px] ' +
                (active ? 'text-ink font-semibold' : 'text-muted font-normal')
              }
              aria-pressed={active}
            >
              {LABELS[key]}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 bottom-0 h-[2px] bg-ink"
                />
              )}
            </button>
          );
        })}
      </nav>
      {value === 'custom' && (
        <CustomRangePanel value={customRange} onChange={onCustomRangeChange} />
      )}
    </>
  );
}

function CustomRangePanel({ value, onChange }) {
  const from = value?.from || '';
  const to = value?.to || '';
  const valid = validateCustomRange(value);
  const hasBoth = Boolean(from && to);
  const tooLong = hasBoth && !valid;

  const setFrom = (v) => onChange({ from: v, to });
  const setTo = (v) => onChange({ from, to: v });

  return (
    <div className="bg-white border-b border-hair px-5 py-3 relative z-20 flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[13px] text-ink flex-wrap">
        <label className="flex items-center gap-2">
          <span className="text-muted">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-white border-b border-hair px-1 py-0.5 text-[13px] text-ink focus:outline-none focus:border-ink"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">To</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="bg-white border-b border-hair px-1 py-0.5 text-[13px] text-ink focus:outline-none focus:border-ink"
          />
        </label>
      </div>
      {tooLong && (
        <div className="text-[12px] text-muted">
          Choose a range up to {CUSTOM_MAX_DAYS} days.
        </div>
      )}
    </div>
  );
}
