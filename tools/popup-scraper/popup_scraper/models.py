"""The PopupEvent model and its mapping to the popups.fyi CSV schema.

The website reads a CSV whose columns are defined in the project README. This
module produces rows matching that schema exactly, plus two trailing helper
columns (`source`, `needs_review`) that the website ignores but that make
manual review easier. Delete those two columns before pasting into the sheet
if you prefer a clean copy.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

# Exact popups.fyi schema order, with two trailing review-only helper columns.
CSV_COLUMNS = [
    "id",
    "name",
    "location_name",
    "start_datetime",
    "end_datetime",
    "timezone",
    "address",
    "lat",
    "lng",
    "city",
    "neighborhood",
    "instagram_url",
    "order_url",
    "category",
    "notes",
    "image_url",
    # --- helper columns (ignored by the website) ---
    "source",
    "needs_review",
]

# Categories the website knows how to render as map icons.
KNOWN_CATEGORIES = {"bakery", "coffee", "matcha", "other"}

# Keyword -> category heuristics, checked against the vendor/event name + notes
# when a source doesn't tell us the category outright. First match wins.
CATEGORY_KEYWORDS = [
    ("matcha", "matcha"),
    ("hojicha", "matcha"),
    ("coffee", "coffee"),
    ("espresso", "coffee"),
    ("latte", "coffee"),
    ("roaster", "coffee"),
    ("cafe", "coffee"),
    ("bakehouse", "bakery"),
    ("bakery", "bakery"),
    ("baker", "bakery"),
    ("pastr", "bakery"),
    ("bread", "bakery"),
    ("croissant", "bakery"),
    ("cookie", "bakery"),
    ("donut", "bakery"),
    ("doughnut", "bakery"),
    ("kolache", "bakery"),
    ("cake", "bakery"),
]


def infer_categories(*texts: Optional[str]) -> List[str]:
    """Guess categories from free text (vendor name, notes, description)."""
    blob = " ".join(t for t in texts if t).lower()
    found: List[str] = []
    for keyword, category in CATEGORY_KEYWORDS:
        if keyword in blob and category not in found:
            found.append(category)
    return found


def _fmt_dt(dt: Optional[datetime]) -> str:
    """Wall-clock ISO string (no offset), matching the sheet's convention.

    The website interprets these against the `timezone` column, so we emit the
    local wall-clock time without a UTC offset (e.g. ``2026-05-20T09:00``).
    """
    if dt is None:
        return ""
    return dt.strftime("%Y-%m-%dT%H:%M")


@dataclass
class PopupEvent:
    """One pop-up occurrence, normalized across every source."""

    name: str
    start: Optional[datetime] = None  # tz-aware, in the event's local zone
    end: Optional[datetime] = None    # tz-aware, in the event's local zone
    timezone: str = "America/Los_Angeles"
    location_name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    city: str = "Seattle"
    neighborhood: Optional[str] = None
    instagram_url: Optional[str] = None
    order_url: Optional[str] = None
    categories: List[str] = field(default_factory=list)
    notes: Optional[str] = None
    image_url: Optional[str] = None

    # Review metadata (not part of the website schema).
    source: str = ""
    confidence: str = "medium"  # high | medium | low
    needs_review: bool = False

    @property
    def stable_id(self) -> str:
        """Deterministic id so re-running doesn't churn ids for the same event."""
        basis = f"{normalize_name(self.name)}|{_fmt_dt(self.start)}|{self.city}".lower()
        digest = hashlib.sha1(basis.encode("utf-8")).hexdigest()[:8]
        return f"gen-{digest}"

    @property
    def category_str(self) -> str:
        cats = self.categories or []
        return ",".join(cats)

    @property
    def has_datetime(self) -> bool:
        return self.start is not None and self.end is not None

    def to_csv_row(self) -> dict:
        review_flags = []
        if self.needs_review:
            review_flags.append("review")
        if not self.has_datetime:
            review_flags.append("no-date")
        if self.lat is None or self.lng is None:
            review_flags.append("no-coords")
        return {
            "id": self.stable_id,
            "name": self.name,
            "location_name": self.location_name or "",
            "start_datetime": _fmt_dt(self.start),
            "end_datetime": _fmt_dt(self.end),
            "timezone": self.timezone,
            "address": self.address or "",
            "lat": "" if self.lat is None else f"{self.lat:.6f}",
            "lng": "" if self.lng is None else f"{self.lng:.6f}",
            "city": self.city,
            "neighborhood": self.neighborhood or "",
            "instagram_url": self.instagram_url or "",
            "order_url": self.order_url or "",
            "category": self.category_str,
            "notes": self.notes or "",
            "image_url": self.image_url or "",
            "source": self.source,
            "needs_review": ";".join(review_flags),
        }


def normalize_name(name: str) -> str:
    """Lowercased, punctuation-stripped name used for dedupe + stable ids."""
    n = (name or "").lower().strip()
    n = re.sub(r"[’'`]", "", n)
    n = re.sub(r"&", " and ", n)
    n = re.sub(r"[^a-z0-9]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()
