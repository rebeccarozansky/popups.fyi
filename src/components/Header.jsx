import { cityHeading } from '../lib/pages.js';

export const PREFIX = 'popups.fyi/';

// Deterministic pseudo-random in [0, 1) so the title doesn't reshuffle on
// every render (which would look twitchy and AI-generated). Each character
// position gets its own seed.
function seed(i) {
  const x = Math.sin((i + 1) * 9973.13) * 10000;
  return x - Math.floor(x);
}

// Hand-drawn jitter applied per character. `offset` keeps the seed sequence
// running across separate runs of text, so the city reads as part of the same
// scribbled wordmark rather than a second, independently-jittered word.
// Also used by the prerendered pages' header (src/prerender).
export function Jitter({ text, offset = 0 }) {
  return [...text].map((ch, i) => {
    const idx = i + offset;
    const rotate = (seed(idx) - 0.5) * 8;
    const translateY = (seed(idx + 100) - 0.5) * 3;
    return (
      <span
        key={idx}
        className="pf-glyph"
        style={{
          transform: `rotate(${rotate.toFixed(2)}deg) translateY(${translateY.toFixed(2)}px)`,
        }}
      >
        {ch}
      </span>
    );
  });
}

export default function Header({ city, cities, onCityChange, onSubmitClick, showSubmit = true }) {
  return (
    <header className="h-12 md:h-14 border-b border-hair bg-white flex items-center px-5 relative z-30">
      {/* The page's one heading, for search engines and screen readers. It's
          visually hidden: the wordmark can't be the <h1> without pulling the
          city picker's option names into it. */}
      <h1 className="sr-only">{cityHeading(city)}</h1>
      {/* Decorative: the wordmark right next to it already carries the
          accessible name, so the mascot stays out of the a11y tree. The
          width/height reserve its space before the SVG arrives. */}
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        draggable="false"
        width={289}
        height={412}
        className="h-10 w-auto md:h-12 shrink-0 select-none mr-1.5"
      />
      <span className="pf-wordmark text-[22px] sm:text-[26px] leading-none text-ink select-none inline-flex items-center">
        <span className="sr-only">popups.fyi, city:</span>
        <span aria-hidden="true">
          <Jitter text={PREFIX} />
        </span>

        {/* The city is a native <select> rendered invisibly on top of the
            hand-drawn text, so the wordmark keeps its look while the control
            still gets real keyboard and mobile-picker behaviour. */}
        <span className="pf-city">
          <span aria-hidden="true">
            <Jitter text={city.slug} offset={PREFIX.length} />
          </span>
          <svg
            aria-hidden="true"
            className="pf-city-caret"
            width="13"
            height="9"
            viewBox="0 0 13 9"
            fill="none"
          >
            <path
              d="M1.2 1.6c1.9 2 3.6 4 5.2 5.6C8.1 5.5 9.9 3.5 11.8 1.4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <select
            className="pf-city-select"
            aria-label="City"
            value={city.slug}
            onChange={(e) => onCityChange(e.target.value)}
          >
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </span>
      </span>

      {showSubmit && (
        <button
          type="button"
          onClick={onSubmitClick}
          className="ml-auto shrink-0 whitespace-nowrap text-[12px] text-muted hover:text-ink underline underline-offset-2"
        >
          Own a pop-up?
        </button>
      )}
    </header>
  );
}
