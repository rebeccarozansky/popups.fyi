"""Time-frame parsing: turn CLI options into a concrete (start, end) window.

All windows are anchored to the configured timezone (Seattle by default) so
"this weekend" means the Seattle weekend, matching how the website interprets
"today"/"this weekend"/"this week".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from dateutil import parser as dtparser
from zoneinfo import ZoneInfo


@dataclass
class TimeFrame:
    start: datetime  # tz-aware, inclusive
    end: datetime    # tz-aware, inclusive
    label: str

    def overlaps(self, ev_start: datetime, ev_end: Optional[datetime]) -> bool:
        """True if an event intersects the window at all."""
        if ev_start is None:
            return False
        e = ev_end or ev_start
        return ev_start <= self.end and e >= self.start

    def __str__(self) -> str:
        return f"{self.label}: {self.start:%Y-%m-%d %H:%M} -> {self.end:%Y-%m-%d %H:%M} ({self.start.tzinfo})"


def _start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _end_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=23, minute=59, second=59, microsecond=0)


def build_timeframe(
    tz_name: str,
    *,
    days: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    today: bool = False,
    this_week: bool = False,
    this_weekend: bool = False,
    this_month: bool = False,
    now: Optional[datetime] = None,
) -> TimeFrame:
    """Resolve exactly one time-frame option into a concrete window.

    Precedence: explicit --start/--end > named windows (--today, --this-week,
    --this-weekend, --this-month) > --days > default (next 14 days).
    """
    tz = ZoneInfo(tz_name)
    now = now.astimezone(tz) if now else datetime.now(tz)

    if start or end:
        s = dtparser.parse(start).replace(tzinfo=tz) if start else _start_of_day(now)
        e = dtparser.parse(end).replace(tzinfo=tz) if end else (s + timedelta(days=14))
        # If only a date was given for `end`, extend to the end of that day.
        if end and e.hour == 0 and e.minute == 0:
            e = _end_of_day(e)
        return TimeFrame(_start_of_day(s), e, "custom range")

    if today:
        return TimeFrame(_start_of_day(now), _end_of_day(now), "today")

    if this_week:
        # Monday..Sunday of the current week.
        monday = _start_of_day(now - timedelta(days=now.weekday()))
        sunday = _end_of_day(monday + timedelta(days=6))
        return TimeFrame(monday, sunday, "this week")

    if this_weekend:
        # Saturday 00:00 .. Sunday 23:59. If today is Sunday, use the current
        # (already-started) weekend; otherwise the upcoming Saturday.
        wd = now.weekday()  # Mon=0 .. Sun=6
        if wd == 6:  # Sunday
            sat = _start_of_day(now - timedelta(days=1))
        else:
            sat = _start_of_day(now + timedelta(days=(5 - wd)))
        sun = _end_of_day(sat + timedelta(days=1))
        return TimeFrame(sat, sun, "this weekend")

    if this_month:
        first = _start_of_day(now.replace(day=1))
        if first.month == 12:
            nxt = first.replace(year=first.year + 1, month=1)
        else:
            nxt = first.replace(month=first.month + 1)
        last = _end_of_day(nxt - timedelta(days=1))
        return TimeFrame(first, last, "this month")

    n = days if days is not None else 14
    return TimeFrame(_start_of_day(now), _end_of_day(now + timedelta(days=n)), f"next {n} days")
