import { useCallback, useEffect, useState } from 'react';
import { CITIES, DEFAULT_CITY, cityFromPath, getCity, pathForCity } from '../lib/cities.js';

// Keeps the active city in sync with the URL path (popups.fyi/<slug>).
//
// The bare domain renders the default city without rewriting the URL, so
// existing links and bookmarks to popups.fyi keep working. An unknown slug
// falls back to the default city and the address bar is corrected.
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

  // Correct unknown paths (/foo) to the default city, preserving the query.
  useEffect(() => {
    const path = window.location.pathname;
    const known = cityFromPath(path);
    const isRoot = path === '/' || path === '';
    if (!known && !isRoot) {
      const url = new URL(window.location.href);
      url.pathname = pathForCity(DEFAULT_CITY);
      window.history.replaceState(null, '', url);
    }
  }, []);

  useEffect(() => {
    document.title = `popups.fyi/${city.slug} — bakery and cafe pop-ups in ${city.name}`;
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
