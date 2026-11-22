import { useCallback, useEffect, useState } from 'react';
import { CITIES, DEFAULT_CITY, cityFromPath, getCity, pathForCity } from '../lib/cities.js';
import { cityPageTitle } from '../lib/pages.js';

// Keeps the active city in sync with the URL path (popups.fyi/<slug>).
//
// The bare domain renders the default city without rewriting the URL, so
// existing links and bookmarks to popups.fyi keep working. Any other path is
// tidied to its city's canonical one: an unknown slug falls back to the
// default city, and shortcuts (/sf) or page addresses that reached the app
// (/seattle/popups/<slug>, see App's readUrlState) become /<slug>.
export function useCityRoute() {
  const [city, setCity] = useState(() => cityFromPath(window.location.pathname) || DEFAULT_CITY);

  // Back/forward navigation between cities.
  useEffect(() => {
    const onPopState = () => {
      setCity(cityFromPath(window.location.pathname) || DEFAULT_CITY);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Correct other paths to their city's canonical path, preserving the query.
  useEffect(() => {
    const path = window.location.pathname;
    const isRoot = path === '/' || path === '';
    if (isRoot) return;
    const canonical = pathForCity(cityFromPath(path) || DEFAULT_CITY);
    if (path !== canonical) {
      const url = new URL(window.location.href);
      url.pathname = canonical;
      window.history.replaceState(null, '', url);
    }
  }, []);

  // Same title as the prerendered city page (scripts/prerender.mjs).
  useEffect(() => {
    document.title = cityPageTitle(city);
  }, [city]);

  // Navigate to another city, keeping the current filter query string.
  const selectCity = useCallback(
    (slug) => {
      const next = getCity(slug);
      if (!next || next.slug === city.slug) return;
      const url = new URL(window.location.href);
      url.pathname = pathForCity(next);
      window.history.pushState(null, '', url);
      setCity(next);
    },
    [city],
  );

  return { city, cities: CITIES, selectCity };
}
