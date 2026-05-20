export const CATEGORY_DOT_COLORS = {
  bakery: '#A07C5B',
  coffee: '#6B4F3A',
  matcha: '#7A8B5C',
  other: '#9CA3AF',
};

export function dotColorFor(category) {
  return CATEGORY_DOT_COLORS[category] || CATEGORY_DOT_COLORS.other;
}

// Renders one inline label per category, each preceded by its colored dot.
// `categories` is the array produced by csv.js (already lowercased, deduped).
export default function CategoryBadge({ categories }) {
  if (!categories || categories.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink">
      {categories.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-[6px] h-[6px] rounded-full"
            style={{ background: dotColorFor(c) }}
          />
          {c}
        </span>
      ))}
    </span>
  );
}
