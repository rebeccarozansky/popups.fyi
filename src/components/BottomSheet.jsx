import { useCallback, useEffect, useRef, useState } from 'react';

// Bottom sheet with three snap points: collapsed / half / full.
// Pixel offsets are computed from the container height.
//
// We track the sheet's `top` offset (distance from the top of the container
// to the top of the sheet). Smaller `top` = sheet pulled higher.

const SNAP_COLLAPSED_HEIGHT = 80;

function computeSnaps(containerHeight) {
  const fullTop = Math.round(containerHeight * 0.15); // 85vh tall
  const halfTop = Math.round(containerHeight * 0.5);  // 50vh tall
  const collapsedTop = containerHeight - SNAP_COLLAPSED_HEIGHT;
  return { fullTop, halfTop, collapsedTop };
}

function nearestSnap(value, snaps, velocity) {
  const { fullTop, halfTop, collapsedTop } = snaps;
  // Velocity-based decision: a strong flick overrides nearest.
  if (Math.abs(velocity) > 0.6) {
    if (velocity > 0) {
      // moving down
      if (value < halfTop) return halfTop;
      return collapsedTop;
    } else {
      // moving up
      if (value > halfTop) return halfTop;
      return fullTop;
    }
  }
  const candidates = [fullTop, halfTop, collapsedTop];
  return candidates.reduce(
    (best, c) => (Math.abs(c - value) < Math.abs(best - value) ? c : best),
    candidates[0],
  );
}

export default function BottomSheet({
  containerHeight,
  topOffset, // space above the sheet (header + chips) so collapsed sits flush at the bottom of the available area
  snapTo,    // 'collapsed' | 'half' | 'full' — controlled snap requests
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

  // Re-clamp when container resizes.
  useEffect(() => {
    setTop((t) => {
      const next = computeSnaps(availableHeight);
      // Map old "label" to new positions.
      const label =
        t <= (next.fullTop + next.halfTop) / 2
          ? 'full'
          : t <= (next.halfTop + next.collapsedTop) / 2
          ? 'half'
          : 'collapsed';
      return label === 'full' ? next.fullTop : label === 'half' ? next.halfTop : next.collapsedTop;
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
    }, 160);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapTo]);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      sheetRef.current?.setPointerCapture?.(e.pointerId);
      dragRef.current = {
        startY: e.clientY,
        startTop: top,
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
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
      const next = Math.min(snaps.collapsedTop, Math.max(snaps.fullTop, d.startTop + dy));
      const now = performance.now();
      const dt = Math.max(now - d.lastT, 1);
      d.velocity = (e.clientY - d.lastY) / dt; // px/ms
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
      sheetRef.current?.releasePointerCapture?.(e.pointerId);
      const snapped = nearestSnap(top, snaps, d.velocity);
      dragRef.current = null;
      setAnimating(true);
      setTop(snapped);
      setTimeout(() => setAnimating(false), 160);
    },
    [top, snaps],
  );

  return (
    <div
      ref={sheetRef}
      className="pf-sheet absolute left-0 right-0 bg-white border-t border-hair flex flex-col"
      style={{
        top: top + topOffset,
        bottom: 0,
        transition: animating ? 'top 150ms ease-out' : 'none',
        zIndex: 500,
      }}
    >
      <div
        className="pt-3 pb-2 flex flex-col items-center select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span aria-hidden="true" className="block w-9 h-1 rounded-full bg-handle" />
        <div className="mt-2 text-[13px] text-muted h-4">{collapsedSummary}</div>
      </div>
      <div className="pf-sheet-scroll flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// Export so the parent can position the Near Me button just above the
// collapsed handle without duplicating the constant.
export const COLLAPSED_HEIGHT = SNAP_COLLAPSED_HEIGHT;
