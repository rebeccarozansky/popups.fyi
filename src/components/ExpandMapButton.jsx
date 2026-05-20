export default function ExpandMapButton({ expanded, onClick, bottomOffset }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? 'Show list' : 'Expand map'}
      className="absolute right-4 w-11 h-11 rounded-full bg-white border border-hair flex items-center justify-center active:bg-surfacealt z-[450]"
      style={{ bottom: bottomOffset + 16 + 44 + 8 }}
    >
      {expanded ? (
        // Arrows-in (collapse)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 4 9 9 4 9" />
          <polyline points="15 4 15 9 20 9" />
          <polyline points="9 20 9 15 4 15" />
          <polyline points="15 20 15 15 20 15" />
        </svg>
      ) : (
        // Arrows-out (expand)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="4 9 4 4 9 4" />
          <polyline points="20 9 20 4 15 4" />
          <polyline points="4 15 4 20 9 20" />
          <polyline points="20 15 20 20 15 20" />
        </svg>
      )}
    </button>
  );
}
