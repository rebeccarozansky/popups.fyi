export default function NearMeButton({ onClick, bottomOffset }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Center map on my location"
      className="absolute right-4 w-11 h-11 rounded-full bg-white border border-hair flex items-center justify-center active:bg-surfacealt z-[450]"
      style={{ bottom: bottomOffset + 16 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0A1628"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  );
}
