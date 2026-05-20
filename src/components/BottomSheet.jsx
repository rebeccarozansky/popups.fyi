import { useCallback, useEffect, useRef, useState } from 'react';

// Bottom sheet with three snap points: collapsed / half / full.
// Pixel offsets are computed from the container height.
//
// Interaction model:
//   - Drag the grab area (handle + summary line) to move the sheet.
//   - Velocity-aware snapping on release: a flick beats nearest-snap.
//   - Tap the grab area (no drag) toggles between collapsed and full,
//     biased by the current position so users can always go "up or down"
//     with a single tap.
//
// We track the sheet's `top` offset (distance from the top of the container
// to the top of the sheet). Smaller `top` = sheet pulled higher.

const SNAP_COLLAPSED_HEIGHT = 80;
const TAP_THRESHOLD_PX = 8;     // movement under this counts as a tap
const TAP_THRESHOLD_MS = 350;   // duration over this is a slow drag, not a tap

function computeSnaps(containerHeight) {
  const fullTop = Math.round(containerHeight * 0.1);  // 90% tall
  const halfTop = Math.round(containerHeight * 0.5);  // 50% tall
  const collapsedTop = containerHeight - SNAP_COLLAPSED_HEIGHT;
  return { fullTop, halfTop, collapsedTop };
}

function nearestSnap(value, snaps, velocity) {
  const { fullTop, halfTop, collapsedTop } = snaps;
  if (Math.abs(velocity) > 0.5) {
    if (velocity > 0) {
      // moving down
      if (value < halfTop) return halfTop;
      return collapsedTop;
    }
    // moving up
    if (value > halfTop) return halfTop;
    return fullTop;
  }
  const candidates = [fullTop, halfTop, collapsedTop];
  return candidates.reduce(
    (best, c) => (Math.abs(c - value) < Math.abs(best - value) ? c : best),
    candidates[0],
  );
}

function labelFor(top, snaps) {
  const { fullTop, halfTop, collapsedTop } = snaps;
  const dFull = Math.abs(top - fullTop);
  const dHalf = Math.abs(top - halfTop);
  const dColl = Math.abs(top - collapsedTop);
  const min = Math.min(dFull, dHalf, dColl);
  if (min === dFull) return 'full';
  if (min === dColl) return 'collapsed';
  return 'half';
}

export default function BottomSheet({
  containerHeight,
  topOffset,
  snapTo,
  onSnapped,
  children,
  collapsedSummary,
}) {
  const availableHeight = Math.max(containerHeight - topOffset, 0);
  const snaps = computeSnaps(availableHeight);

  const [top, setTop] = useState(snaps.halfTop);
  const [animating, setAnimating] = useState(false);
  const dragRef = useRef(null);
  const sheetRef = useRef(null);
  const grabRef = useRef(null);

  // Re-clamp when container resizes — preserve the current label.
  useEffect(() => {
    setTop((t) => {
      const prevSnaps = computeSnaps(availableHeight);
      const next = computeSnaps(availableHeight);
      const which = labelFor(t, prevSnaps);
      return which === 'full' ? next.fullTop : which === 'collapsed' ? next.collapsedTop : next.halfTop;
    });
  }, [availableHeight]);

  // Controlled snap request from parent.
  useEffect(() => {
    if (!snapTo) return;
    const target =
      snapTo === 'full' ? snaps.fullTop : snapTo === 'collapsed' ? snaps.collapsedTop : snaps.halfTop;
    setAnimating(true);
    setTop(target);
    const id = setTimeout(() => {
      setAnimating(false);
      onSnapped?.();
    }, 220);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapTo]);

  const snapToLabel = useCallback(
    (label) => {
      const target =
        label === 'full' ? snaps.fullTop : label === 'collapsed' ? snaps.collapsedTop : snaps.halfTop;
      setAnimating(true);
      setTop(target);
      setTimeout(() => setAnimating(false), 220);
    },
    [snaps.fullTop, snaps.halfTop, snaps.collapsedTop],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      grabRef.current?.setPointerCapture?.(e.pointerId);
      dragRef.current = {
        startY: e.clientY,
        startTop: top,
        lastY: e.clientY,
        lastT: performance.now(),
        startT: performance.now(),
        velocity: 0,
        moved: 0,
      };
      setAnimating(false);
    },
    [top],
  );

  const onPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      d.moved = Math.max(d.moved, Math.abs(dy));
      const next = Math.min(snaps.collapsedTop, Math.max(snaps.fullTop, d.startTop + dy));
      const now = performance.now();
      const dt = Math.max(now - d.lastT, 1);
      d.velocity = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = now;
      setTop(next);
    },
    [snaps.collapsedTop, snaps.fullTop],
  );

  const finishDrag = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d) return;
      grabRef.current?.releasePointerCapture?.(e.pointerId);
      dragRef.current = null;

      const duration = performance.now() - d.startT;
      const isTap = d.moved < TAP_THRESHOLD_PX && duration < TAP_THRESHOLD_MS;

      if (isTap) {
        // Toggle: from collapsed → full; from full → collapsed;
        // from half → full (going "up" by default since the user is most
        // likely interested in seeing more popups).
        const here = labelFor(top, snaps);
        const target = here === 'full' ? 'collapsed' : 'full';
        snapToLabel(target);
        return;
      }

      const snapped = nearestSnap(top, snaps, d.velocity);
      setAnimating(true);
      setTop(snapped);
      setTimeout(() => setAnimating(false), 220);
    },
    [top, snaps, snapToLabel],
  );

  return (
    <div
      ref={sheetRef}
      className="pf-sheet absolute left-0 right-0 bg-white border-t border-hair flex flex-col"
      style={{
        top: top + topOffset,
        bottom: 0,
        transition: animating ? 'top 200ms cubic-bezier(.2,.8,.2,1)' : 'none',
        zIndex: 500,
      }}
    >
      <div
        ref={grabRef}
        role="button"
        tabIndex={0}
        aria-label="Drag to resize or tap to toggle"
        className="pt-3 pb-3 flex flex-col items-center select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const here = labelFor(top, snaps);
            snapToLabel(here === 'full' ? 'collapsed' : 'full');
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const here = labelFor(top, snaps);
            snapToLabel(here === 'collapsed' ? 'half' : 'full');
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const here = labelFor(top, snaps);
            snapToLabel(here === 'full' ? 'half' : 'collapsed');
          }
        }}
      >
        <span aria-hidden="true" className="block w-12 h-1.5 rounded-full bg-handle" />
        <div className="mt-2 text-[13px] text-muted h-4">{collapsedSummary}</div>
      </div>
      <div className="pf-sheet-scroll flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// Export so the parent can position the Near Me button just above the
// collapsed handle without duplicating the constant.
export const COLLAPSED_HEIGHT = SNAP_COLLAPSED_HEIGHT;
