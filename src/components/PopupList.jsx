import { useEffect, useRef } from 'react';
import PopupCard from './PopupCard.jsx';

export default function PopupList({ popups, onSelect, scrollToId, status, onRetry }) {
  const refs = useRef({});

  useEffect(() => {
    if (!scrollToId) return;
    const node = refs.current[scrollToId];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scrollToId]);

  if (status === 'loading') {
    return <div className="px-5 py-6 text-muted text-[13px]">Loading</div>;
  }

  if (status === 'error' && popups.length === 0) {
    return (
      <div className="px-5 py-8">
        <p className="text-ink">Couldn&apos;t load pop-up data.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-[13px] font-semibold text-ink underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (popups.length === 0) {
    return (
      <div className="px-5 py-8 text-ink">No pop-ups happening this week.</div>
    );
  }

  return (
    <div>
      {popups.map((p) => (
        <PopupCard
          key={p.id}
          popup={p}
          ref={(el) => {
            if (el) refs.current[p.id] = el;
            else delete refs.current[p.id];
          }}
          onClick={onSelect}
        />
      ))}
    </div>
  );
}
