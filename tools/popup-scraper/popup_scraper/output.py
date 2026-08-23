"""Write results to CSV files and print a human-readable summary."""

from __future__ import annotations

import csv
import os
from typing import List

from .models import CSV_COLUMNS, PopupEvent


def _write_csv(path: str, events: List[PopupEvent]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for ev in events:
            writer.writerow(ev.to_csv_row())


def write_outputs(events: List[PopupEvent], out_dir: str) -> dict:
    """Split events into a dated "ready" file and an undated "leads" file.

    - popups.generated.csv : events with real dates -> review + paste into sheet.
    - popups.leads.csv      : vendors/venues worth checking manually (no date
                              was machine-readable, e.g. Hotplate storefronts
                              when browser mode is off).
    """
    dated = [e for e in events if e.has_datetime]
    leads = [e for e in events if not e.has_datetime]

    generated_path = os.path.join(out_dir, "popups.generated.csv")
    leads_path = os.path.join(out_dir, "popups.leads.csv")

    _write_csv(generated_path, dated)
    if leads:
        _write_csv(leads_path, leads)

    return {
        "generated_path": generated_path,
        "leads_path": leads_path if leads else None,
        "dated": dated,
        "leads": leads,
    }


def print_summary(result: dict, per_source_counts: dict, timeframe_label: str) -> None:
    dated = result["dated"]
    leads = result["leads"]
    review = [e for e in dated if e.needs_review or e.lat is None or e.lng is None]

    print("\n" + "=" * 64)
    print(f"  popups.fyi scrape complete  —  window: {timeframe_label}")
    print("=" * 64)

    if per_source_counts:
        print("  Events found per source:")
        for name, count in per_source_counts.items():
            print(f"    - {name:24s} {count}")

    print(f"\n  Dated events written : {len(dated)}  -> {result['generated_path']}")
    if review:
        print(f"    (of those, {len(review)} need a manual lat/lng or a second look)")
    if leads:
        print(f"  Manual leads to check: {len(leads)}  -> {result['leads_path']}")

    if dated:
        print("\n  Upcoming (first 15):")
        for ev in dated[:15]:
            when = ev.start.strftime("%a %b %d %H:%M") if ev.start else "??"
            where = ev.location_name or ev.neighborhood or ev.address or "?"
            cats = f" [{ev.category_str}]" if ev.category_str else ""
            print(f"    {when}  {ev.name}{cats}  @ {where}  ({ev.source})")

    if leads:
        print("\n  Vendors to eyeball on Instagram/Hotplate for this window:")
        for ev in leads[:20]:
            hint = ev.notes or ev.instagram_url or ev.order_url or ""
            print(f"    - {ev.name}  {hint}")

    print("\n  Next: open the generated CSV, sanity-check the rows, fill any")
    print("  gaps, then paste into your Google Sheet. The trailing `source`")
    print("  and `needs_review` columns are ignored by the site — delete them")
    print("  if you want a clean paste.\n")
