"""Fill in latitude/longitude for events.

Resolution order for each event:
  1. Coordinates the source already provided (e.g. some JSON-LD events).
  2. A known venue from the config (exact + fuzzy name match) -> instant,
     accurate, and free. This is why listing your frequent host venues pays
     off: you never geocode them again.
  3. OpenStreetMap Nominatim geocoding of the address/location string, cached
     to disk and rate-limited to 1 request/second per Nominatim's usage policy.

Events that still have no coordinates are kept but flagged `needs_review` so
you can drop a pin manually.
"""

from __future__ import annotations

import json
import os
import time
from typing import Dict, Optional, Tuple

from .config import Config
from .http import HttpClient
from .models import PopupEvent

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


class Geocoder:
    def __init__(self, cfg: Config, http: HttpClient, cache_path: str, verbose: bool = False):
        self.cfg = cfg
        self.http = http
        self.cache_path = cache_path
        self.verbose = verbose
        self.cache: Dict[str, Optional[Tuple[float, float]]] = self._load_cache()
        self._last_request = 0.0

    def _load_cache(self) -> Dict[str, Optional[Tuple[float, float]]]:
        if os.path.exists(self.cache_path):
            try:
                with open(self.cache_path, "r", encoding="utf-8") as fh:
                    return json.load(fh)
            except Exception:  # noqa: BLE001
                return {}
        return {}

    def save_cache(self) -> None:
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        with open(self.cache_path, "w", encoding="utf-8") as fh:
            json.dump(self.cache, fh, indent=2)

    def _nominatim(self, query: str) -> Optional[Tuple[float, float]]:
        if query in self.cache:
            cached = self.cache[query]
            return tuple(cached) if cached else None
        if not self.cfg.geocode_enabled:
            return None

        # Nominatim policy: <=1 req/sec and an identifiable UA.
        gap = 1.1 - (time.monotonic() - self._last_request)
        if gap > 0:
            time.sleep(gap)
        self._last_request = time.monotonic()

        ua_email = self.cfg.geocode_user_agent_email or "anonymous@example.com"
        headers = {"User-Agent": f"popups.fyi-scraper/1.0 ({ua_email})"}
        resp = self.http.get(
            NOMINATIM_URL,
            params={"q": query, "format": "json", "limit": 1, "countrycodes": "us"},
            headers=headers,
        )
        result: Optional[Tuple[float, float]] = None
        if resp is not None and resp.status_code == 200:
            try:
                data = resp.json()
                if data:
                    result = (float(data[0]["lat"]), float(data[0]["lon"]))
            except Exception:  # noqa: BLE001
                result = None
        self.cache[query] = list(result) if result else None
        if self.verbose:
            print(f"    [geocode] {query!r} -> {result}")
        return result

    def resolve(self, ev: PopupEvent) -> None:
        """Populate ev.lat/lng (and venue metadata) in place."""
        # 1) Already geocoded by the source.
        if ev.lat is not None and ev.lng is not None:
            return

        # 2) Known venue match (from location_name first, then address).
        venue = self.cfg.match_venue(ev.location_name) or self.cfg.match_venue(ev.address)
        if venue and venue.lat is not None and venue.lng is not None:
            ev.lat, ev.lng = venue.lat, venue.lng
            ev.neighborhood = ev.neighborhood or venue.neighborhood
            ev.address = ev.address or venue.address
            ev.city = venue.city or ev.city
            return

        # 3) Nominatim on the best available location string.
        query = ev.address or ev.location_name
        if query:
            # Bias toward the target city if it isn't already in the string.
            if ev.city and ev.city.lower() not in query.lower():
                query = f"{query}, {ev.city}"
            coords = self._nominatim(query)
            if coords:
                ev.lat, ev.lng = coords
                return

        ev.needs_review = True
