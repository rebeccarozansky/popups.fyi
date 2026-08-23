"""Source registry: maps config `type:` strings to Source classes."""

from __future__ import annotations

from typing import List

from ..config import Config, Source as SourceCfg
from .base import Context, Source
from .eventbrite import EventbriteSource
from .hotplate import HotplateSource
from .ical import IcalSource
from .jsonld import JsonLdSource
from .meta_posts import MetaPostsSource

REGISTRY = {
    cls.type_name: cls
    for cls in (JsonLdSource, EventbriteSource, IcalSource, HotplateSource, MetaPostsSource)
}

# Friendly aliases so config stays readable.
REGISTRY["eventbrite_search"] = EventbriteSource
REGISTRY["instagram_posts"] = MetaPostsSource
REGISTRY["facebook_posts"] = MetaPostsSource


def build_sources(cfg: Config) -> List[Source]:
    sources: List[Source] = []
    for s in cfg.sources:  # type: SourceCfg
        cls = REGISTRY.get(s.type)
        if cls is None:
            print(f"  [warn] unknown source type {s.type!r} (skipping)")
            continue
        sources.append(cls(urls=s.urls, options=s.options))
    return sources


__all__ = ["Context", "Source", "build_sources", "REGISTRY"]
