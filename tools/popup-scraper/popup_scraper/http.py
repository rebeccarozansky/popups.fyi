"""A small, polite shared HTTP client.

- Sets a real browser User-Agent (many sites 403 the default requests UA).
- Retries transient failures with backoff.
- Rate-limits per host so we never hammer a site.
"""

from __future__ import annotations

import time
from typing import Dict, Optional
from urllib.parse import urlparse

import requests

_DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


class HttpClient:
    def __init__(self, min_interval: float = 1.0, timeout: int = 25, verbose: bool = False):
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": _DEFAULT_UA,
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        self.min_interval = min_interval
        self.timeout = timeout
        self.verbose = verbose
        self._last_hit: Dict[str, float] = {}

    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        last = self._last_hit.get(host, 0.0)
        wait = self.min_interval - (time.monotonic() - last)
        if wait > 0:
            time.sleep(wait)
        self._last_hit[host] = time.monotonic()

    def get(
        self,
        url: str,
        *,
        params: Optional[dict] = None,
        headers: Optional[dict] = None,
        retries: int = 3,
    ) -> Optional[requests.Response]:
        for attempt in range(1, retries + 1):
            self._throttle(url)
            try:
                resp = self.session.get(
                    url, params=params, headers=headers, timeout=self.timeout
                )
                if resp.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(f"HTTP {resp.status_code}")
                return resp
            except Exception as exc:  # noqa: BLE001 - report + backoff on anything
                if self.verbose:
                    print(f"    [http] {url} attempt {attempt}/{retries} failed: {exc}")
                if attempt == retries:
                    return None
                time.sleep(1.5 * attempt)
        return None
