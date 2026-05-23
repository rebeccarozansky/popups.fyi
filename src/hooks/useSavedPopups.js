import { useCallback, useEffect, useState } from 'react';

// Saved pop-ups are persisted in localStorage as a JSON array of ids.
// localStorage (not cookies) is the right tool here: it has more room, it
// never gets sent to the server, and it survives page reloads + restarts.
// Cross-tab sync via the `storage` event keeps two open windows in agreement.

const STORAGE_KEY = 'popupsfyi.saved.v1';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v) => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function write(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function useSavedPopups() {
  const [saved, setSaved] = useState(() =>
    typeof window === 'undefined' ? new Set() : read(),
  );

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setSaved(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((id) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(next);
      return next;
    });
  }, []);

  const isSaved = useCallback((id) => saved.has(id), [saved]);

  return { saved, isSaved, toggle };
}
