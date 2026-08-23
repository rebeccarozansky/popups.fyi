"""Parse locally saved Instagram/Facebook/Threads post captions.

Meta properties are usually login-gated and not reliable to scrape directly.
This source is the practical bridge: copy/paste promising post captions into a
local CSV/YAML file, and the scraper extracts dates, times, and known venues
into the same reviewable CSV output as the web sources.
"""

from __future__ import annotations

import csv
import os
import re
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

import yaml
from dateutil import parser as dtparser
from zoneinfo import ZoneInfo

from ..config import Vendor
from ..models import PopupEvent, infer_categories, normalize_name
from .base import Context, Source

_MONTH_DATE_RE = re.compile(
    r"\b(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?\s+)?"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+"
    r"\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b",
    re.I,
)
_NUMERIC_DATE_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b")
_WEEKDAY_RE = re.compile(
    r"\b(?:(this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
    re.I,
)
_TIME_RE = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?", re.I)
_TIME_RANGE_RE = re.compile(
    r"\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*"
    r"(?:-|–|—|to|until)\s*"
    r"(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\b",
    re.I,
)
_SINGLE_TIME_RE = re.compile(r"\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b", re.I)

_WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def _resolve_path(ctx: Context, path: str) -> str:
    if os.path.isabs(path):
        return path
    base = getattr(ctx.cfg, "config_dir", None) or os.getcwd()
    candidate = os.path.join(base, path)
    return candidate if os.path.exists(candidate) else os.path.abspath(path)


def _load_rows(path: str) -> Iterable[Dict[str, str]]:
    ext = os.path.splitext(path)[1].lower()
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        if ext in (".yaml", ".yml"):
            data = yaml.safe_load(fh) or []
            if isinstance(data, dict):
                data = data.get("posts", []) or []
            for row in data:
                if isinstance(row, dict):
                    yield {str(k): "" if v is None else str(v) for k, v in row.items()}
            return

        reader = csv.DictReader(fh)
        for row in reader:
            yield {str(k): (v or "") for k, v in row.items()}


def _clean_date_text(text: str) -> str:
    return re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", text, flags=re.I)


def _parse_explicit_date(text: str, default: datetime, tz: ZoneInfo) -> Optional[datetime]:
    try:
        parsed = dtparser.parse(_clean_date_text(text), default=default)
    except (ValueError, OverflowError):
        return None
    return parsed.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz)


def _weekday_date(match: re.Match, window_start: datetime) -> datetime:
    modifier = (match.group(1) or "").lower()
    weekday = _WEEKDAYS[match.group(2).lower()]
    days_ahead = (weekday - window_start.weekday()) % 7
    if modifier == "next" and days_ahead == 0:
        days_ahead = 7
    return (window_start + timedelta(days=days_ahead)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def _candidate_dates(text: str, ctx: Context, tz: ZoneInfo) -> List[datetime]:
    default = ctx.timeframe.start.replace(hour=0, minute=0, second=0, microsecond=0)
    dates: List[datetime] = []
    seen = set()

    for regex in (_MONTH_DATE_RE, _NUMERIC_DATE_RE):
        for match in regex.finditer(text):
            parsed = _parse_explicit_date(match.group(0), default, tz)
            if parsed and parsed.date().isoformat() not in seen:
                seen.add(parsed.date().isoformat())
                dates.append(parsed)

    for match in _WEEKDAY_RE.finditer(text):
        parsed = _weekday_date(match, ctx.timeframe.start)
        if parsed.date().isoformat() not in seen:
            seen.add(parsed.date().isoformat())
            dates.append(parsed)

    return dates


def _meridiem(token: str) -> Optional[str]:
    match = _TIME_RE.search(token)
    if not match or not match.group(3):
        return None
    return match.group(3).lower().replace(".", "")


def _time_parts(token: str, fallback_meridiem: Optional[str] = None) -> Optional[Tuple[int, int]]:
    match = _TIME_RE.search(token)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or "0")
    meridiem = _meridiem(token) or fallback_meridiem
    if meridiem == "pm" and hour != 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return hour, minute


def _parse_time_range(text: str, default_start_time: str,
                      default_duration_hours: float) -> Tuple[Tuple[int, int], Tuple[int, int], bool]:
    range_match = _TIME_RANGE_RE.search(text)
    if range_match:
        start_token, end_token = range_match.group(1), range_match.group(2)
        end_meridiem = _meridiem(end_token)
        start_meridiem = _meridiem(start_token)
        if not start_meridiem and end_meridiem:
            start_hour = int(_TIME_RE.search(start_token).group(1))
            end_hour = int(_TIME_RE.search(end_token).group(1))
            start_meridiem = "am" if end_meridiem == "pm" and start_hour > end_hour else end_meridiem
        start = _time_parts(start_token, start_meridiem)
        end = _time_parts(end_token, end_meridiem or start_meridiem)
        if start and end:
            return start, end, False

    single_match = _SINGLE_TIME_RE.search(text)
    if single_match:
        start = _time_parts(single_match.group(0))
        if start:
            start_dt = datetime(2000, 1, 1, start[0], start[1])
            end_dt = start_dt + timedelta(hours=default_duration_hours)
            return start, (end_dt.hour, end_dt.minute), True

    start = _time_parts(default_start_time, "am") or (10, 0)
    start_dt = datetime(2000, 1, 1, start[0], start[1])
    end_dt = start_dt + timedelta(hours=default_duration_hours)
    return start, (end_dt.hour, end_dt.minute), True


def _find_vendor(ctx: Context, name: str) -> Optional[Vendor]:
    norm = normalize_name(name)
    if not norm:
        return None
    for vendor in ctx.cfg.vendors:
        if normalize_name(vendor.name) == norm:
            return vendor
    for vendor in ctx.cfg.vendors:
        vendor_norm = normalize_name(vendor.name)
        if vendor_norm and (vendor_norm in norm or norm in vendor_norm):
            return vendor
    return None


class MetaPostsSource(Source):
    type_name = "meta_posts"

    def fetch(self, ctx: Context) -> List[PopupEvent]:
        files = self.options.get("files") or self.urls
        if isinstance(files, str):
            files = [files]
        if not files:
            self.log(ctx, "no files configured")
            return []

        tz = ZoneInfo(ctx.cfg.timezone)
        default_start_time = str(self.options.get("default_start_time") or "10:00")
        default_duration_hours = float(self.options.get("default_duration_hours") or 4)
        emit_undated_leads = bool(self.options.get("emit_undated_leads", True))
        out: List[PopupEvent] = []

        for configured_path in files:
            path = _resolve_path(ctx, str(configured_path))
            if not os.path.exists(path):
                self.log(ctx, f"skip missing file {configured_path}")
                continue
            for row in _load_rows(path):
                events = self._row_to_events(
                    row, ctx, tz, default_start_time, default_duration_hours, emit_undated_leads
                )
                out.extend(events)

        self.log(ctx, f"kept {len(out)} row(s)")
        return out

    def _row_to_events(
        self,
        row: Dict[str, str],
        ctx: Context,
        tz: ZoneInfo,
        default_start_time: str,
        default_duration_hours: float,
        emit_undated_leads: bool,
    ) -> List[PopupEvent]:
        caption = row.get("caption") or row.get("text") or row.get("description") or ""
        vendor_name = row.get("vendor") or row.get("name") or row.get("creator") or ""
        if not vendor_name:
            self.log(ctx, "skip Meta row without vendor/name")
            return []

        vendor = _find_vendor(ctx, vendor_name)
        platform = (row.get("platform") or "meta").strip().lower()
        post_url = row.get("post_url") or row.get("url") or row.get("permalink") or ""
        instagram_url = row.get("instagram_url") or (vendor.instagram if vendor else "")
        explicit_location = row.get("location_name") or row.get("venue") or row.get("location") or ""
        venue = ctx.cfg.match_venue(explicit_location) or ctx.cfg.match_venue(caption)
        location_name = explicit_location or (venue.name if venue else None) or (vendor.home_venue if vendor else None)
        categories = [vendor.category] if vendor and vendor.category else infer_categories(vendor_name, caption)
        note = caption.strip()
        if len(note) > 180:
            note = f"{note[:177].rstrip()}..."

        dates = _candidate_dates(caption, ctx, tz)
        if not dates:
            if not emit_undated_leads:
                return []
            return [
                PopupEvent(
                    name=vendor_name.strip(),
                    timezone=ctx.cfg.timezone,
                    location_name=location_name,
                    instagram_url=instagram_url or None,
                    order_url=post_url or None,
                    categories=categories,
                    notes=note or f"Saved {platform} post - date needs review.",
                    source=f"meta_posts:{platform}",
                    confidence="low",
                    needs_review=True,
                )
            ]

        start_time, end_time, guessed_time = _parse_time_range(
            caption, default_start_time, default_duration_hours
        )
        event_note = note or f"Saved {platform} post - verify details."
        if guessed_time:
            event_note = f"{event_note} Time was guessed; verify."
        out: List[PopupEvent] = []
        for date in dates:
            start = date.replace(hour=start_time[0], minute=start_time[1])
            end = date.replace(hour=end_time[0], minute=end_time[1])
            if end <= start:
                end += timedelta(days=1)
            if not ctx.timeframe.overlaps(start, end):
                continue
            out.append(
                PopupEvent(
                    name=vendor_name.strip(),
                    start=start,
                    end=end,
                    timezone=ctx.cfg.timezone,
                    location_name=location_name,
                    instagram_url=instagram_url or None,
                    order_url=post_url or None,
                    categories=categories,
                    notes=event_note,
                    source=f"meta_posts:{platform}",
                    confidence="low",
                    needs_review=True,
                )
            )
        return out