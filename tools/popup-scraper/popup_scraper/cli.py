"""Command-line entry point.

Examples:
    python scrape.py --this-weekend
    python scrape.py --days 30
    python scrape.py --start 2026-05-18 --end 2026-05-31
    python scrape.py --this-month --verbose
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import OrderedDict

from .config import load_config
from .dedupe import dedupe
from .geocode import Geocoder
from .http import HttpClient
from .output import print_summary, write_outputs
from .sources import Context, build_sources
from .timeframe import build_timeframe

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="scrape.py",
        description="Collect upcoming Seattle pop-ups into a popups.fyi CSV.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--config", default=os.path.join(_HERE, "config.yaml"),
                   help="Path to config.yaml (default: alongside scrape.py).")
    p.add_argument("--out", default=os.path.join(_HERE, "output"),
                   help="Output directory (default: ./output).")

    tf = p.add_argument_group("time frame (choose one; default = next 14 days)")
    tf.add_argument("--days", type=int, help="Next N days from today.")
    tf.add_argument("--start", help="Start date YYYY-MM-DD (use with --end).")
    tf.add_argument("--end", help="End date YYYY-MM-DD (use with --start).")
    tf.add_argument("--today", action="store_true", help="Just today.")
    tf.add_argument("--this-week", action="store_true", help="Mon–Sun of this week.")
    tf.add_argument("--this-weekend", action="store_true", help="Sat–Sun.")
    tf.add_argument("--this-month", action="store_true", help="1st–last of this month.")

    p.add_argument("--limit-per-source", type=int, default=40,
                   help="Max event pages to open per source (default: 40).")
    p.add_argument("--no-geocode", action="store_true",
                   help="Skip Nominatim lookups (still uses known venues).")
    p.add_argument("--verbose", "-v", action="store_true", help="Chatty logging.")
    return p


def main(argv=None) -> int:
    args = build_arg_parser().parse_args(argv)

    try:
        cfg = load_config(args.config)
    except FileNotFoundError as exc:
        print(exc)
        return 2
    if args.no_geocode:
        cfg.geocode_enabled = False

    timeframe = build_timeframe(
        cfg.timezone,
        days=args.days,
        start=args.start,
        end=args.end,
        today=args.today,
        this_week=args.this_week,
        this_weekend=args.this_weekend,
        this_month=args.this_month,
    )
    print(f"Time frame -> {timeframe}")

    http = HttpClient(verbose=args.verbose)
    ctx = Context(
        cfg=cfg,
        http=http,
        timeframe=timeframe,
        limit_per_source=args.limit_per_source,
        verbose=args.verbose,
    )

    sources = build_sources(cfg)
    if not sources:
        print("No sources configured. Add some under `sources:` in config.yaml.")
        return 1

    all_events = []
    per_source_counts = OrderedDict()
    for src in sources:
        label = src.type_name
        print(f"\n> {label}: fetching...")
        try:
            events = src.fetch(ctx)
        except Exception as exc:  # noqa: BLE001 - one source must not kill the run
            print(f"  [error] {label} failed: {exc}")
            events = []
        per_source_counts[label] = per_source_counts.get(label, 0) + len(events)
        all_events.extend(events)

    # Geocode (known venues first, then Nominatim) before dedupe so merges can
    # reconcile coordinates. Undated leads only get known-venue coordinates;
    # the script should not spend external geocoding calls on manual leads.
    geocoder = Geocoder(
        cfg, http, os.path.join(args.out, ".geocode-cache.json"), verbose=args.verbose
    )
    for ev in all_events:
        has_known_venue = cfg.match_venue(ev.location_name) or cfg.match_venue(ev.address)
        if ev.has_datetime or has_known_venue:
            geocoder.resolve(ev)
    geocoder.save_cache()

    merged = dedupe(all_events)

    result = write_outputs(merged, args.out)
    print_summary(result, per_source_counts, timeframe.label)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
