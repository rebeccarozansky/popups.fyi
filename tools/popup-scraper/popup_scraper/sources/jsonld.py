"""Generic schema.org/Event extraction from any page's JSON-LD.

Lots of event/venue platforms embed machine-readable event data in a
``<script type="application/ld+json">`` block: Eventbrite, Squarespace, Wix,
many restaurant/venue sites, and Google-indexed event pages. This adapter
reads that data directly, which is far more robust than scraping HTML layout.

The helpers here (`extract_ld_events`, `ld_event_to_popup`) are reused by the
Eventbrite adapter.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from dateutil import parser as dtparser
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from ..models import PopupEvent, infer_categories
from .base import Context, Source


def _iter_ld_nodes(data):
    """Yield every dict node in a parsed JSON-LD payload (handles @graph/lists)."""
    if isinstance(data, list):
        for item in data:
            yield from _iter_ld_nodes(item)
    elif isinstance(data, dict):
        if "@graph" in data and isinstance(data["@graph"], list):
            for item in data["@graph"]:
                yield from _iter_ld_nodes(item)
        yield data


def _is_event(node: dict) -> bool:
    t = node.get("@type", "")
    t = " ".join(t) if isinstance(t, list) else str(t)
    return "Event" in t


def extract_ld_events(html: str) -> List[dict]:
    """Return all schema.org Event nodes embedded in a page."""
    soup = BeautifulSoup(html, "html.parser")
    events: List[dict] = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = tag.string or tag.get_text() or ""
        text = text.strip()
        if not text:
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        for node in _iter_ld_nodes(data):
            if _is_event(node):
                events.append(node)
    return events


def _build_address(addr) -> Optional[str]:
    if isinstance(addr, str):
        return addr.strip() or None
    if isinstance(addr, dict):
        parts = [
            addr.get("streetAddress"),
            addr.get("addressLocality"),
            addr.get("addressRegion"),
            addr.get("postalCode"),
        ]
        joined = ", ".join(p for p in parts if p)
        return joined or None
    return None


def _parse_dt(value: Optional[str], tz: ZoneInfo) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = dtparser.parse(value)
    except (ValueError, OverflowError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def ld_event_to_popup(node: dict, tz_name: str, source: str) -> Optional[PopupEvent]:
    tz = ZoneInfo(tz_name)
    name = node.get("name")
    if not name:
        return None
    start = _parse_dt(node.get("startDate"), tz)
    end = _parse_dt(node.get("endDate"), tz) or start
    if start is None:
        return None

    location = node.get("location")
    location_name = None
    address = None
    lat = lng = None
    city = None
    if isinstance(location, dict):
        location_name = location.get("name")
        address = _build_address(location.get("address"))
        geo = location.get("geo")
        if isinstance(geo, dict):
            try:
                lat = float(geo.get("latitude"))
                lng = float(geo.get("longitude"))
            except (TypeError, ValueError):
                lat = lng = None
        addr = location.get("address")
        if isinstance(addr, dict):
            city = addr.get("addressLocality")
    elif isinstance(location, str):
        location_name = location

    image = node.get("image")
    if isinstance(image, list):
        image = image[0] if image else None
    if isinstance(image, dict):
        image = image.get("url")

    description = node.get("description") or ""
    order_url = node.get("url")

    return PopupEvent(
        name=name.strip(),
        start=start,
        end=end,
        timezone=tz_name,
        location_name=location_name.strip() if isinstance(location_name, str) else None,
        address=address,
        lat=lat,
        lng=lng,
        city=city or "Seattle",
        order_url=order_url,
        categories=infer_categories(name, description),
        notes=(description[:180].strip() or None) if description else None,
        image_url=image if isinstance(image, str) else None,
        source=source,
        confidence="high" if (lat and lng) else "medium",
    )


class JsonLdSource(Source):
    type_name = "jsonld"

    def fetch(self, ctx: Context) -> List[PopupEvent]:
        out: List[PopupEvent] = []
        for url in self.urls:
            resp = ctx.http.get(url)
            if resp is None or resp.status_code != 200:
                self.log(ctx, f"skip {url} (no response)")
                continue
            nodes = extract_ld_events(resp.text)
            self.log(ctx, f"{url}: {len(nodes)} event node(s)")
            for node in nodes:
                ev = ld_event_to_popup(node, ctx.cfg.timezone, self.type_name)
                if ev and ctx.timeframe.overlaps(ev.start, ev.end):
                    out.append(ev)
        return out
