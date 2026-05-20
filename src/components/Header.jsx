const TITLE = 'popups.fyi';

// Deterministic pseudo-random in [0, 1) so the title doesn't reshuffle on
// every render (which would look twitchy and AI-generated). Each character
// position gets its own seed.
function seed(i) {
  const x = Math.sin((i + 1) * 9973.13) * 10000;
  return x - Math.floor(x);
}

export default function Header() {
  return (
    <header className="h-12 border-b border-hair bg-white flex items-center px-5 relative z-30">
      <span
        className="pf-wordmark text-[26px] leading-none text-ink select-none"
        aria-label={TITLE}
        role="img"
      >
        {[...TITLE].map((ch, i) => {
          const r = seed(i);
          const rotate = (r - 0.5) * 8;
          const translateY = (seed(i + 100) - 0.5) * 3;
          return (
            <span
              key={i}
              aria-hidden="true"
              style={{ transform: `rotate(${rotate.toFixed(2)}deg) translateY(${translateY.toFixed(2)}px)` }}
            >
              {ch}
            </span>
          );
        })}
      </span>
    </header>
  );
}
