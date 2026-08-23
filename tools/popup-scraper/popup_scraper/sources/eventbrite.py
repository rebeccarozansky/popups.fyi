"""Eventbrite adapter.

Given one or more Eventbrite discovery/search URLs (e.g.
``https://www.eventbrite.com/d/wa--seattle/pop-up/``), this finds the
individual event pages linked from them and reads each event's schema.org
JSON-LD (dates, venue, address). Good for markets, tastings, and larger
food/drink pop-ups that get listed on Eventbrite.
"""

from __future__ import annotations

import re
from typing import List

from ..models import PopupEvent
from .base import Context, Source
from .jsonld import extract_ld_events, ld_event_to_popup

_EVENT_LINK = re.compile(r"https://www\.eventbrite\.com/e/[a-z0-9\-]+-tickets-\d+")

DEFAULT_INCLUDE_KEYWORDS = [
    "bakery",
    "bake",
    "pastry",
    "pastries",
    "coffee",
    "cafe",
    "matcha",
    "tea",
    "food",
    "dinner",
    "brunch",
    "supper",
    "lunch",
    "dessert",
    "farmers market",
    "tasting",
    "chef",
    "restaurant",
    "culinary",
    "bar",
    "wine",
    "beer",
    "cocktail",
    "ramen",
    "taco",
    "dumpling",
    "boba",
    "ice cream",
]

DEFAULT_EXCLUDE_KEYWORDS = [
    "webinar",
    "cold calling",
    "sales funnel",
    "real estate",
    "networking",
    "career",
    "startup",
    "marketing",
    "investment",
    "conference",
    "seminar",
]


def _event_text(ev: PopupEvent) -> str:
    parts = [
        ev.name,
        ev.location_name or "",
        ev.address or "",
        ev.notes or "",
        ev.category_str,
    ]
    return " ".join(parts).lower()


def _looks_relevant(ev: PopupEvent, include_keywords: List[str], exclude_keywords: List[str]) -> bool:
    text = _event_text(ev)
    has_include = any(keyword.lower() in text for keyword in include_keywords)
    has_exclude = any(keyword.lower() in text for keyword in exclude_keywords)
    return has_include and not (has_exclude and not ev.categories)


class EventbriteSource(Source):
    type_name = "eventbrite"

    def fetch(self, ctx: Context) -> List[PopupEvent]:
        include_keywords = self.options.get("include_keywords") or DEFAULT_INCLUDE_KEYWORDS
        exclude_keywords = self.options.get("exclude_keywords") or DEFAULT_EXCLUDE_KEYWORDS
        event_urls: List[str] = []
        seen = set()
        for disco in self.urls:
            resp = ctx.http.get(disco)
            if resp is None or resp.status_code != 200:
                self.log(ctx, f"skip discovery {disco}")
                continue
            for m in _EVENT_LINK.findall(resp.text):
                url = m.split("?")[0]
                if url not in seen:
                    seen.add(url)
                    event_urls.append(url)
            self.log(ctx, f"{disco}: {len(seen)} event link(s) so far")

        out: List[PopupEvent] = []
        for url in event_urls[: ctx.limit_per_source]:
            resp = ctx.http.get(url)
            if resp is None or resp.status_code != 200:
                continue
            for node in extract_ld_events(resp.text):
                ev = ld_event_to_popup(node, ctx.cfg.timezone, self.type_name)
                if not ev:
                    continue
                ev.order_url = url
                if ctx.timeframe.overlaps(ev.start, ev.end):
                    if not _looks_relevant(ev, include_keywords, exclude_keywords):
                        self.log(ctx, f"skip irrelevant event {ev.name!r}")
                        continue
                    out.append(ev)
                    break  # one Event node per page is plenty
        self.log(ctx, f"kept {len(out)} event(s) inside the window")
        return out
