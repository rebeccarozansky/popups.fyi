import { useEffect, useRef, useState } from 'react';
import { SHEET_CSV_URL, CACHE_KEY, CACHE_MAX_AGE_MS } from '../lib/config.js';
import { parseCsv, readCache, writeCache } from '../lib/csv.js';

// status:
//   'loading' — nothing to show yet
//   'ready'   — popups available (from cache or network)
//   'stale'   — popups available, but background refresh failed
//   'error'   — no popups and network failed too
export function usePopups() {
  const [popups, setPopups] = useState([]);
  const [status, setStatus] = useState('loading');
  const [retryTick, setRetryTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let hadCache = false;

    // 1. Synchronous cache hydration — render instantly if we have data.
    const cached = readCache(CACHE_KEY);
    if (cached) {
      try {
        const parsed = parseCsv(cached.csv);
        if (parsed.length) {
          hadCache = true;
          setPopups(parsed);
          setStatus('ready'); // will flip to 'stale' if refresh fails
        }
      } catch {
        /* fall through to network */
      }
    }

    // 2. Always refresh in the background. A cache-buster query param keeps
    //    Google's edge cache from serving stale CSV after the sheet edits.
    (async () => {
      try {
        const sep = SHEET_CSV_URL.includes('?') ? '&' : '?';
        const url = `${SHEET_CSV_URL}${sep}_=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (/<!DOCTYPE html>/i.test(text.slice(0, 200))) {
          throw new Error('Got HTML instead of CSV (sheet likely not public)');
        }
        const parsed = parseCsv(text);
        if (!mounted.current) return;
        setPopups(parsed);
        setStatus('ready');
        writeCache(CACHE_KEY, text);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[popups.fyi] CSV fetch failed', err);
        if (!mounted.current) return;
        setStatus(hadCache ? 'stale' : 'error');
      }
    })();

    void CACHE_MAX_AGE_MS;
  }, [retryTick]);

  const retry = () => setRetryTick((n) => n + 1);

  return { popups, status, retry };
}
