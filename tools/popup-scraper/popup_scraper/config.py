"""Load and validate the YAML configuration.

The config describes *what* to scrape (sources), *who* to track (vendors),
and *where* they pop up (venues). Everything except a couple of defaults is
optional so the tool degrades gracefully if a section is missing.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import yaml

from .models import normalize_name


@dataclass
class Venue:
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    neighborhood: Optional[str] = None
    city: str = "Seattle"
    aliases: List[str] = field(default_factory=list)

    def all_names(self) -> List[str]:
        return [self.name, *self.aliases]


@dataclass
class Vendor:
    name: str
    category: Optional[str] = None
    hotplate: Optional[str] = None       # hotplate.com/<handle>
    instagram: Optional[str] = None
    website: Optional[str] = None
    order_url: Optional[str] = None
    home_venue: Optional[str] = None     # matches a Venue name/alias
    ical: Optional[str] = None           # optional per-vendor .ics feed


@dataclass
class Source:
    type: str
    urls: List[str] = field(default_factory=list)
    options: Dict = field(default_factory=dict)


@dataclass
class Config:
    config_dir: str = ""
    city: str = "Seattle"
    timezone: str = "America/Los_Angeles"
    geocode_enabled: bool = True
    geocode_user_agent_email: str = ""
    venues: List[Venue] = field(default_factory=list)
    vendors: List[Vendor] = field(default_factory=list)
    sources: List[Source] = field(default_factory=list)

    # Fast lookup: normalized venue name/alias -> Venue.
    _venue_index: Dict[str, Venue] = field(default_factory=dict, repr=False)

    def build_indexes(self) -> None:
        self._venue_index = {}
        for v in self.venues:
            for nm in v.all_names():
                self._venue_index[normalize_name(nm)] = v

    def match_venue(self, text: Optional[str]) -> Optional[Venue]:
        """Best-effort match of a free-text location string to a known venue."""
        if not text:
            return None
        norm = normalize_name(text)
        if norm in self._venue_index:
            return self._venue_index[norm]
        # Substring match against known venue names (handles "... at Parlour").
        for key, venue in self._venue_index.items():
            if key and (key in norm or norm in key):
                return venue
        return None


def load_config(path: str) -> Config:
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Config not found: {path}\n"
            f"Copy config.example.yaml to config.yaml and edit it."
        )
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}

    geocode = raw.get("geocode", {}) or {}
    cfg = Config(
        config_dir=os.path.dirname(os.path.abspath(path)),
        city=raw.get("city", "Seattle"),
        timezone=raw.get("timezone", "America/Los_Angeles"),
        geocode_enabled=bool(geocode.get("enabled", True)),
        geocode_user_agent_email=geocode.get("user_agent_email", "") or "",
    )

    for v in raw.get("venues", []) or []:
        cfg.venues.append(
            Venue(
                name=v["name"],
                lat=v.get("lat"),
                lng=v.get("lng"),
                address=v.get("address"),
                neighborhood=v.get("neighborhood"),
                city=v.get("city", cfg.city),
                aliases=v.get("aliases", []) or [],
            )
        )

    for v in raw.get("vendors", []) or []:
        cfg.vendors.append(
            Vendor(
                name=v["name"],
                category=v.get("category"),
                hotplate=v.get("hotplate"),
                instagram=v.get("instagram"),
                website=v.get("website"),
                order_url=v.get("order_url"),
                home_venue=v.get("home_venue"),
                ical=v.get("ical"),
            )
        )

    for s in raw.get("sources", []) or []:
        known = {"type", "urls"}
        cfg.sources.append(
            Source(
                type=s["type"],
                urls=s.get("urls", []) or [],
                options={k: val for k, val in s.items() if k not in known},
            )
        )

    cfg.build_indexes()
    return cfg
