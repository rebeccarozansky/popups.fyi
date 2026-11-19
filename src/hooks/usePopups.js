import { useEffect, useRef, useState } from 'react';
import {
  SHEET_CSV_URL,
  CACHE_KEY,
  CACHE_MAX_AGE_MS,
  RESIDENCY_CSV_URL,
  RESIDENCY_CACHE_KEY,
} from '../lib/config.js';
import { parseCsv, parseResidencyCsv, readCache, writeCache } from '../lib/csv.js';

// status:
//   'loading'  — nothing to show yet
//   'ready'    — rows available (from cache or network)
//   'stale'    — rows available, but background refresh failed
//   'error'    — no rows and network failed too
//   'disabled' — no sheet configured (residencies only)
function useSheet(url, cacheKey, parse) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(url ? 'loading' : 'disabled');
  const [retryTick, setRetryTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url) return;
    let hadCache = false;

    // 1. Synchronous cache hydration — render instantly if we have data.
    const cached = readCache(cacheKey);
    if (cached) {
      try {
        const parsed = parse(cached.csv);
        if (parsed.length) {
          hadCache = true;
          setRows(parsed);
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
        const sep = url.includes('?') ? '&' : '?';
        const res = await fetch(`${url}${sep}_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (/<!DOCTYPE html>/i.test(text.slice(0, 200))) {
          throw new Error('Got HTML instead of CSV (sheet likely not public)');
        }
        const parsed = parse(text);
        if (!mounted.current) return;
        setRows(parsed);
        setStatus('ready');
        writeCache(cacheKey, text);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[popups.fyi] CSV fetch failed (${cacheKey})`, err);
        if (!mounted.current) return;
        setStatus(hadCache ? 'stale' : 'error');
      }
    })();

    void CACHE_MAX_AGE_MS;
  }, [url, cacheKey, parse, retryTick]);

  const retry = () => setRetryTick((n) => n + 1);

  return { rows, status, retry };
}

export function usePopups() {
  const { rows, status, retry } = useSheet(SHEET_CSV_URL, CACHE_KEY, parseCsv);
  return { popups: rows, status, retry };
}

// Residencies are an optional second sheet. A failure here only hides the
// residencies; it never blocks the main list or shows an error state.
export function useResidencies() {
  const { rows, status } = useSheet(RESIDENCY_CSV_URL, RESIDENCY_CACHE_KEY, parseResidencyCsv);
  return { residencies: rows, status };
}
