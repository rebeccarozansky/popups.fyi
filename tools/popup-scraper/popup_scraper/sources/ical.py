"""iCalendar (.ics) adapter.

Some venues/vendors publish a public calendar feed (Google Calendar "public
address in iCal format", Squarespace event feeds, etc.). This adapter parses
VEVENTs and expands simple weekly/daily recurrences within the requested
window -- handy for weekly residencies.

Deliberately a small, dependency-free parser: it handles the fields pop-up
calendars actually use (SUMMARY, DTSTART/DTEND with TZID/UTC/all-day,
LOCATION, URL, DESCRIPTION, and basic RRULE FREQ=DAILY/WEEKLY).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from zoneinfo import ZoneInfo

from ..models import PopupEvent, infer_categories
from .base import Context, Source

_WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def _unfold(text: str) -> List[str]:
    """Undo RFC 5545 line folding (continuation lines start with space/tab)."""
    lines: List[str] = []
    for raw in text.splitlines():
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _parse_prop(line: str):
    """Split 'NAME;PARAM=x:value' into (name, {params}, value)."""
    if ":" not in line:
        return None
    head, value = line.split(":", 1)
    parts = head.split(";")
    name = parts[0].upper()
    params: Dict[str, str] = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.upper()] = v
    return name, params, value.strip()


def _parse_dt(value: str, params: Dict[str, str], default_tz: ZoneInfo) -> Optional[datetime]:
    value = value.strip()
    try:
        if params.get("VALUE") == "DATE" or (len(value) == 8 and "T" not in value):
            dt = datetime.strptime(value, "%Y%m%d")
            return dt.replace(tzinfo=default_tz)
        if value.endswith("Z"):
            dt = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=ZoneInfo("UTC"))
            return dt.astimezone(default_tz)
        tz = ZoneInfo(params["TZID"]) if params.get("TZID") else default_tz
        fmt = "%Y%m%dT%H%M%S" if len(value) >= 15 else "%Y%m%dT%H%M"
        return datetime.strptime(value[:15], fmt).replace(tzinfo=tz).astimezone(default_tz)
    except (ValueError, KeyError):
        return None


def _parse_rrule(value: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for part in value.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.upper()] = v.upper()
    return out


def _expand(start: datetime, end: Optional[datetime], rrule: Dict[str, str],
            win_start: datetime, win_end: datetime) -> List[tuple]:
    """Expand a recurrence into (start, end) pairs that fall in the window."""
    if not rrule:
        return [(start, end)]
    freq = rrule.get("FREQ")
    if freq not in ("DAILY", "WEEKLY"):
        return [(start, end)]  # unsupported recurrence -> just the base event

    interval = int(rrule.get("INTERVAL", "1") or "1")
    count = int(rrule["COUNT"]) if "COUNT" in rrule else None
    until = None
    if "UNTIL" in rrule:
        u = rrule["UNTIL"].rstrip("Z")
        try:
            until = datetime.strptime(u[:15], "%Y%m%dT%H%M%S").replace(tzinfo=start.tzinfo)
        except ValueError:
            try:
                until = datetime.strptime(u[:8], "%Y%m%d").replace(tzinfo=start.tzinfo)
            except ValueError:
                until = None

    duration = (end - start) if (start and end) else timedelta(0)
    bydays = [_WEEKDAYS[d] for d in rrule.get("BYDAY", "").split(",") if d in _WEEKDAYS]

    occurrences: List[tuple] = []
    step = timedelta(days=interval) if freq == "DAILY" else timedelta(weeks=interval)
    cursor = start
    emitted = 0
    # Cap iterations so a malformed rule can't loop forever.
    for _ in range(400):
        if until and cursor > until:
            break
        if count is not None and emitted >= count:
            break
        candidates = [cursor]
        if freq == "WEEKLY" and bydays:
            week_start = cursor - timedelta(days=cursor.weekday())
            candidates = [week_start + timedelta(days=d,
                          hours=start.hour, minutes=start.minute) for d in bydays]
        for occ_start in candidates:
            occ_end = occ_start + duration
            if occ_start > win_end:
                continue
            if occ_end < win_start:
                continue
            occurrences.append((occ_start, occ_end))
        emitted += 1
        cursor = cursor + step
        if cursor > win_end + step:
            break
    return occurrences or [(start, end)]


def _parse_vevents(text: str) -> List[Dict]:
    vevents: List[Dict] = []
    current: Optional[Dict] = None
    for line in _unfold(text):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current is not None:
                vevents.append(current)
            current = None
        elif current is not None:
            parsed = _parse_prop(line)
            if not parsed:
                continue
            name, params, value = parsed
            current[name] = (params, value)
    return vevents


class IcalSource(Source):
    type_name = "ical"

    def fetch(self, ctx: Context) -> List[PopupEvent]:
        tz = ZoneInfo(ctx.cfg.timezone)
        out: List[PopupEvent] = []
        for url in self.urls:
            resp = ctx.http.get(url)
            if resp is None or resp.status_code != 200:
                self.log(ctx, f"skip {url}")
                continue
            for ve in _parse_vevents(resp.text):
                if "DTSTART" not in ve or "SUMMARY" not in ve:
                    continue
                start = _parse_dt(ve["DTSTART"][1], ve["DTSTART"][0], tz)
                end = _parse_dt(ve["DTEND"][1], ve["DTEND"][0], tz) if "DTEND" in ve else start
                if start is None:
                    continue
                rrule = _parse_rrule(ve["RRULE"][1]) if "RRULE" in ve else {}
                summary = ve["SUMMARY"][1]
                location = ve["LOCATION"][1] if "LOCATION" in ve else None
                url_prop = ve["URL"][1] if "URL" in ve else None
                desc = ve["DESCRIPTION"][1] if "DESCRIPTION" in ve else None

                for occ_start, occ_end in _expand(
                    start, end, rrule, ctx.timeframe.start, ctx.timeframe.end
                ):
                    if not ctx.timeframe.overlaps(occ_start, occ_end):
                        continue
                    out.append(
                        PopupEvent(
                            name=summary.strip(),
                            start=occ_start,
                            end=occ_end,
                            timezone=ctx.cfg.timezone,
                            location_name=location.strip() if location else None,
                            address=location.strip() if location else None,
                            order_url=url_prop,
                            categories=infer_categories(summary, desc),
                            notes=(desc[:180].strip() if desc else None),
                            source=self.type_name,
                            confidence="medium",
                        )
                    )
        self.log(ctx, f"kept {len(out)} occurrence(s)")
        return out
