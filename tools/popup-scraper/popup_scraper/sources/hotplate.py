"""Hotplate adapter.

Many Seattle bakery/cafe pop-ups sell through Hotplate storefronts
(``hotplate.com/<handle>``). This adapter is driven by the ``vendors`` list in
your config (each vendor may carry a ``hotplate`` handle).

What it does reliably (no browser needed):
  - Confirms the storefront exists / is active (the page server-renders the
    store config into ``__NEXT_DATA__.props.pageProps.siteSettings``).
  - Pulls the vendor's Instagram, display name, and banner image from there.
  - Emits a "lead" (no fixed date) so you know to eyeball that storefront /
    Instagram for your window. These land in popups.leads.csv, not the main
    dated file.

What needs the optional browser mode (``use_browser: true`` + Playwright):
  - Exact upcoming drop dates/times/locations, which Hotplate loads client-side
    from Firebase and are therefore not in the initial HTML. With Playwright
    installed the adapter renders the page and reads the drop cards. This path
    is best-effort: emitted events are marked low-confidence + needs_review so
    you always verify them.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import List, Optional, Tuple

from dateutil import parser as dtparser
from zoneinfo import ZoneInfo

from ..config import Vendor
from ..models import PopupEvent
from .base import Context, Source

_NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)


def _fetch_site_settings(ctx: Context, handle: str) -> Optional[dict]:
    url = f"https://hotplate.com/{handle}"
    resp = ctx.http.get(url)
    if resp is None or resp.status_code != 200:
        return None
    m = _NEXT_DATA.search(resp.text)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    return data.get("props", {}).get("pageProps", {}).get("siteSettings")


def _instagram_from_settings(ss: dict) -> Optional[str]:
    links = ss.get("socialMediaLinks") or {}
    return links.get("instagram")


def _banner_from_settings(ss: dict) -> Optional[str]:
    styles = ss.get("styles") or {}
    return styles.get("bannerImage") or styles.get("bigLogo") or None


class HotplateSource(Source):
    type_name = "hotplate"

    def fetch(self, ctx: Context) -> List[PopupEvent]:
        use_browser = bool(self.options.get("use_browser", False))
        vendors = [v for v in ctx.cfg.vendors if v.hotplate]
        if not vendors:
            self.log(ctx, "no vendors have a `hotplate` handle in config")
            return []

        out: List[PopupEvent] = []
        for vendor in vendors:
            handle = vendor.hotplate.strip().strip("/").split("/")[-1]
            ss = _fetch_site_settings(ctx, handle)
            if not ss:
                self.log(ctx, f"{handle}: storefront not found / inactive")
                continue

            instagram = _instagram_from_settings(ss) or vendor.instagram
            banner = _banner_from_settings(ss)
            storefront = f"https://hotplate.com/{handle}"
            display_name = ss.get("restaurantName") or vendor.name

            drops: List[Tuple[datetime, datetime, Optional[str]]] = []
            if use_browser:
                try:
                    drops = _extract_drops_with_browser(handle, ctx)
                    self.log(ctx, f"{handle}: browser found {len(drops)} drop(s)")
                except Exception as exc:  # noqa: BLE001
                    self.log(ctx, f"{handle}: browser mode failed ({exc})")

            if drops:
                for start, end, loc in drops:
                    if not ctx.timeframe.overlaps(start, end):
                        continue
                    out.append(
                        _vendor_event(
                            vendor, display_name, start, end, loc, instagram,
                            storefront, banner, ctx.cfg.timezone,
                            notes="Drop time read from Hotplate storefront - verify.",
                            confidence="low", needs_review=True,
                        )
                    )
            else:
                # No dated drops available -> emit a manual lead.
                note = "Active on Hotplate - check storefront for drops in your window."
                if use_browser:
                    note = "Active on Hotplate - no drops parsed; check storefront."
                out.append(
                    _vendor_event(
                        vendor, display_name, None, None, None, instagram,
                        storefront, banner, ctx.cfg.timezone,
                        notes=note, confidence="medium", needs_review=True,
                    )
                )
        return out


def _vendor_event(
    vendor: Vendor,
    display_name: str,
    start: Optional[datetime],
    end: Optional[datetime],
    loc: Optional[str],
    instagram: Optional[str],
    storefront: str,
    banner: Optional[str],
    tz_name: str,
    *,
    notes: str,
    confidence: str,
    needs_review: bool,
) -> PopupEvent:
    categories = [vendor.category] if vendor.category else []
    location_name = loc or vendor.home_venue
    return PopupEvent(
        name=vendor.name or display_name,
        start=start,
        end=end,
        timezone=tz_name,
        location_name=location_name,
        instagram_url=instagram,
        order_url=vendor.order_url or storefront,
        categories=categories,
        notes=notes,
        image_url=banner,
        source="hotplate",
        confidence=confidence,
        needs_review=needs_review,
    )


# --- optional browser path -------------------------------------------------

_DATE_RE = re.compile(
    r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}",
    re.I,
)
_TIME_RANGE_RE = re.compile(
    r"(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))",
    re.I,
)


def _parse_drop_datetime(date_text: str, time_text: str, tz: ZoneInfo,
                         now: datetime) -> Optional[Tuple[datetime, datetime]]:
    tr = _TIME_RANGE_RE.search(time_text or "")
    start_t = tr.group(1) if tr else "12:00 PM"
    end_t = tr.group(2) if tr else start_t
    try:
        default = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = dtparser.parse(f"{date_text} {start_t}", default=default)
        end = dtparser.parse(f"{date_text} {end_t}", default=default)
    except (ValueError, OverflowError):
        return None
    # Year inference: nudge into the future if the parsed date is in the past.
    if start.replace(tzinfo=tz) < now:
        start = start.replace(year=start.year + 1)
        end = end.replace(year=end.year + 1)
    return start.replace(tzinfo=tz), end.replace(tzinfo=tz)


def _extract_drops_with_browser(handle: str, ctx: Context):
    """Render the storefront and heuristically read drop date/time blocks.

    Best-effort: Hotplate's DOM can change. Returns a list of
    (start, end, location) tuples. Requires Playwright + a Chromium install:
        pip install playwright && playwright install chromium
    """
    from playwright.sync_api import sync_playwright  # imported lazily

    tz = ZoneInfo(ctx.cfg.timezone)
    now = datetime.now(tz)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"https://hotplate.com/{handle}", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2500)  # let Firebase-driven drop cards settle
        body_text = page.inner_text("body")
        browser.close()

    # Pair each detected date with the nearest following time range.
    for m in _DATE_RE.finditer(body_text):
        date_text = m.group(0)
        window = body_text[m.end(): m.end() + 120]
        parsed = _parse_drop_datetime(date_text, window, tz, now)
        if parsed:
            results.append((parsed[0], parsed[1], None))
    # De-dup identical (start) values while preserving order.
    seen = set()
    unique = []
    for start, end, loc in results:
        key = start.isoformat()
        if key not in seen:
            seen.add(key)
            unique.append((start, end, loc))
    return unique
