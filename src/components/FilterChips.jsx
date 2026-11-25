import { useEffect, useId, useRef, useState } from 'react';
import { CUSTOM_MAX_DAYS, validateCustomRange } from '../lib/dateFilters.js';
import ResidencyGlyph from './ResidencyGlyph.jsx';

const LABELS = {
  today: 'Today',
  weekend: 'Weekend',
  week: 'This Week',
  custom: 'Custom',
};

const ORDER = ['today', 'weekend', 'week', 'custom'];

// `residency` is { on, onToggle }, or null to hide the switch (no residency
// sheet configured, none in this city, or Instagram mode).
export default function FilterChips({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  residency = null,
}) {
  return (
    <>
      <nav
        className={
          'h-12 border-b border-hair bg-white flex items-stretch px-5 relative ' +
          // Above the map's legend and buttons (z-450) and the phone list
          // sheet (z-500), which the residency explanation drops over.
          'z-[700] ' +
          // Phones need a slightly tighter row to fit the switch and its "?"
          // beside the four chips (tighter still under 390px); without a
          // switch the spacing is unchanged.
          (residency ? 'gap-3 min-[390px]:gap-4 sm:gap-5' : 'gap-5')
        }
        aria-label="Filter pop-ups"
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
        {residency && <ResidencyToggle on={residency.on} onToggle={residency.onToggle} />}
      </nav>
      {value === 'custom' && (
        <CustomRangePanel value={customRange} onChange={onCustomRangeChange} />
      )}
    </>
  );
}

// Layers residencies (standing weekly slots) onto the list and map. A switch
// rather than a fifth chip: the chips pick ONE date window, while this adds
// residencies on top of whichever window is active. The "?" after it says
// what a residency is.
function ResidencyToggle({ on, onToggle }) {
  return (
    <div className="ml-auto shrink-0 h-full flex items-center relative">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onToggle(!on)}
        title="Vendors with a regular weekly spot"
        className={'h-full flex items-center gap-2 text-[13px] ' + (on ? 'text-ink' : 'text-muted')}
      >
        {/* Phones have no room for the word beside the four chips (it pushed
            "This Week" onto two lines), so they show the residency mark from
            the legend instead. The word stays as the switch's accessible name. */}
        <ResidencyGlyph size={14} strokeWidth={1.6} className="sm:hidden" />
        <span className="sr-only sm:not-sr-only">Residencies</span>
        <HandSwitch on={on} />
      </button>
      <ResidencyHelp />
    </div>
  );
}

// The "?" and the short explanation it opens below the row (positioned by
// ResidencyToggle's wrapper). Closes on a second tap, a tap anywhere else, or
// Escape.
function ResidencyHelp() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!buttonRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="What's a residency?"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        // The padding widens the tap target; the negative margin lets it run
        // into the row's padding so the mark itself lines up with the edge.
        className={
          'h-full -mr-1.5 px-1.5 flex items-center ' +
          (open ? 'text-ink' : 'text-muted hover:text-ink')
        }
      >
        <HelpMark />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full mt-2 w-[260px] max-w-[calc(100vw-2.5rem)] bg-white border border-hair px-4 py-3 text-left"
      >
        {/* Notch pointing up at the "?", centred under the 15px mark. */}
        <span
          aria-hidden="true"
          className="absolute -top-[5px] right-[2px] w-[9px] h-[9px] rotate-45 bg-white border-l border-t border-hair"
        />
        <p className="text-[13px] font-semibold text-ink">What&apos;s a residency?</p>
        <p className="mt-1 text-[12px] leading-snug text-muted text-pretty">
          A re-occurring pop-up that&apos;s at the same location every single
          week. Look for the{' '}
          <ResidencyGlyph size={11} strokeWidth={1.6} className="inline-block align-[-1px] text-ink" />{' '}
          on the map and in the list.
        </p>
      </div>
    </>
  );
}

// Hand-drawn "?" in a lumpy circle, to match the switch beside it.
function HelpMark() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M8.3 1.6 C 12 1.5 14.5 4.3 14.4 8.1 C 14.3 11.8 11.5 14.5 7.8 14.4 C 4.2 14.3 1.5 11.5 1.6 7.8 C 1.7 4.2 4.6 1.7 8.3 1.6 Z" />
      <path d="M5.9 6.1 C 6 4.9 6.9 4.1 8.1 4.1 C 9.3 4.2 10.2 5 10.1 6.1 C 10 7.1 9.2 7.5 8.6 7.9 C 8.1 8.3 7.9 8.7 8 9.4" />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Sketchy switch to match the hand-drawn icons: lumpy track that fills with
// ink when on, knob slides across.
function HandSwitch({ on }) {
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true" className="shrink-0">
      <path
        d="M8.2 1.7 C 12 1.3 16.6 1.5 20.1 1.6 C 24 1.8 26.5 4.5 26.4 8.1 C 26.3 11.7 23.7 14.3 19.9 14.4 C 16 14.6 11.8 14.5 7.9 14.3 C 4.3 14.1 1.6 11.5 1.7 7.9 C 1.8 4.4 4.5 1.9 8.2 1.7 Z"
        fill={on ? '#0A1628' : '#FFFFFF'}
        stroke={on ? '#0A1628' : '#9CA3AF'}
        strokeWidth="1.5"
        style={{ transition: 'fill 140ms ease-out, stroke 140ms ease-out' }}
      />
      <g style={{ transform: `translateX(${on ? 12 : 0}px)`, transition: 'transform 160ms ease-out' }}>
        <path
          d="M8.1 3.9 C 10.5 3.8 12.3 5.7 12.2 8.1 C 12.1 10.4 10.3 12.2 8 12.1 C 5.7 12 3.9 10.2 4 7.9 C 4.1 5.6 5.8 4 8.1 3.9 Z"
          fill="#FFFFFF"
          stroke={on ? '#FFFFFF' : '#9CA3AF'}
          strokeWidth="1.5"
        />
      </g>
    </svg>
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
