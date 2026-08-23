"""Merge duplicate events that arrive from more than one source.

Two events are considered the same occurrence when they share a normalized
name and start on the same calendar day. When merging, we keep the richest,
highest-confidence values for each field.
"""

from __future__ import annotations

from typing import List, Optional

from .models import PopupEvent, normalize_name

_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1, "": 0}


def _key(ev: PopupEvent) -> tuple:
    day = ev.start.date().isoformat() if ev.start else "no-date"
    return (normalize_name(ev.name), day)


def _prefer(a: Optional[str], b: Optional[str]) -> Optional[str]:
    """Prefer the longer non-empty string (usually the more informative one)."""
    if a and b:
        return a if len(a) >= len(b) else b
    return a or b


def _merge_pair(base: PopupEvent, other: PopupEvent) -> PopupEvent:
    # Let the higher-confidence event own scalar coordinates/time.
    hi, lo = (base, other)
    if _CONFIDENCE_RANK.get(other.confidence, 0) > _CONFIDENCE_RANK.get(base.confidence, 0):
        hi, lo = other, base

    hi.location_name = _prefer(hi.location_name, lo.location_name)
    hi.address = _prefer(hi.address, lo.address)
    hi.neighborhood = hi.neighborhood or lo.neighborhood
    hi.instagram_url = hi.instagram_url or lo.instagram_url
    hi.order_url = hi.order_url or lo.order_url
    hi.image_url = hi.image_url or lo.image_url
    hi.notes = _prefer(hi.notes, lo.notes)

    if hi.lat is None or hi.lng is None:
        hi.lat, hi.lng = lo.lat, lo.lng

    for c in lo.categories:
        if c not in hi.categories:
            hi.categories.append(c)

    sources = {s for s in (hi.source, lo.source) if s}
    hi.source = "+".join(sorted(sources))
    hi.needs_review = hi.needs_review or lo.needs_review
    return hi


def dedupe(events: List[PopupEvent]) -> List[PopupEvent]:
    merged: dict = {}
    for ev in events:
        k = _key(ev)
        if k in merged:
            merged[k] = _merge_pair(merged[k], ev)
        else:
            merged[k] = ev
    out = list(merged.values())
    # Dated events first (ordered by start), then undated leads by name.
    out.sort(key=lambda e: (e.start is None, e.start.isoformat() if e.start else "", e.name))
    return out
