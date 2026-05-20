const ORDER = ['date', 'distance'];
const LABELS = { date: 'Date', distance: 'Distance' };

export default function SortToggle({ value, onChange, distanceAvailable }) {
  return (
    <div
      className="bg-white border-b border-hair flex items-center px-5 gap-5"
      role="tablist"
      aria-label="Sort pop-ups"
    >
      <span className="text-[13px] text-muted">Sort</span>
      {ORDER.map((key) => {
        const active = value === key;
        const disabled = key === 'distance' && !distanceAvailable;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={
              'relative py-3 text-[13px] ' +
              (active
                ? 'text-ink font-semibold'
                : disabled
                ? 'text-faint font-normal'
                : 'text-muted font-normal')
            }
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
    </div>
  );
}
