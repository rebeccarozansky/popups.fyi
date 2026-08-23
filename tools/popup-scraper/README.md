# popups.fyi manual scraper

This is a manual helper for finding upcoming Seattle pop-ups without changing the website render path. Nothing in `src/` imports it; run it only when you want a fresh CSV to review.

It is intentionally a review tool, not a fully automated publisher. It writes dated events that look ready to `output/popups.generated.csv` and lower-confidence vendor leads to `output/popups.leads.csv` so you can fill gaps from Instagram, Facebook, Threads, or vendor pages before updating the Google Sheet.

## Setup

From the repo root in PowerShell:

```powershell
Set-Location tools\popup-scraper
..\..\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If you are not using the repo virtualenv, `python -m pip install -r requirements.txt` works too.

The scraper reads `config.yaml` by default. If it is missing, copy `config.example.yaml` to `config.yaml`, then edit:

- `venues`: frequent host venues from the sheet, plus exact addresses/coords for automatic fill-in.
- `vendors`: pop-up creators to track, especially Hotplate handles and Instagram URLs.
- `sources`: pages or feeds to scrape.
- `geocode.user_agent_email`: a real email for OpenStreetMap/Nominatim geocoding requests.

For Instagram/Facebook/Threads posts, copy `meta-posts.example.csv` to `meta-posts.csv` and paste one promising post per row. `meta-posts.csv` is ignored by Git because it is local working data.

## Run

```powershell
..\..\.venv\Scripts\python.exe scrape.py --days 30
```

Useful time-frame options:

```powershell
..\..\.venv\Scripts\python.exe scrape.py --today
..\..\.venv\Scripts\python.exe scrape.py --this-weekend
..\..\.venv\Scripts\python.exe scrape.py --this-month
..\..\.venv\Scripts\python.exe scrape.py --start 2026-07-10 --end 2026-07-31
```

Fast smoke test without external geocoding:

```powershell
..\..\.venv\Scripts\python.exe scrape.py --days 14 --no-geocode --limit-per-source 2 --verbose
```

Outputs land in `output/`:

- `popups.generated.csv`: dated rows to review and paste into the Google Sheet.
- `popups.leads.csv`: active vendors/storefronts worth checking manually when exact dates were not machine-readable.
- `.geocode-cache.json`: cached Nominatim results so repeat runs are polite and faster.

The generated CSV follows the site schema and adds two trailing review columns, `source` and `needs_review`. The site ignores extra columns, but you can delete them before pasting if you want the sheet to stay tidy.

## Sources

Supported source types:

- `hotplate`: checks configured vendor Hotplate storefronts. By default it emits manual leads because Hotplate loads exact drop details client-side.
- `eventbrite_search`: opens Eventbrite discovery pages, follows event links, and reads structured event data.
- `meta_posts`: reads locally saved Instagram/Facebook/Threads captions from CSV/YAML and extracts dates, times, and known venues.
- `jsonld`: reads schema.org `Event` JSON-LD from specific event or venue pages.
- `ical`: reads public `.ics` calendar feeds and expands simple daily/weekly recurring events.

Eventbrite can return unrelated business/webinar events. The `include_keywords` and `exclude_keywords` lists under the Eventbrite source keep the output focused on food, drink, bakery, cafe, market, and chef pop-ups. Tune those lists as you find better searches.

## Instagram, Facebook, and Threads

The script does not blindly scrape Meta pages. Public Instagram/Facebook/Threads pages are often login-gated, aggressively rate-limited, and unreliable without official Meta API access. The supported workflow is:

1. Save or copy promising posts as you find them.
2. Paste the post URL, vendor, optional venue, and caption into `meta-posts.csv`.
3. Run the scraper for your target window.
4. Review rows marked `source=meta_posts:instagram` or similar.

CSV format:

```csv
platform,vendor,post_url,instagram_url,location_name,caption
instagram,Armadillo Bakehouse,https://www.instagram.com/p/example/,https://instagram.com/armadillobakehouse,Armadillo Bakehouse,"Saturday July 4, 10am-1pm at Armadillo Bakehouse. Kolaches, sweet buns, and coffee until sold out."
```

The parser understands dates like `July 4`, `7/4`, `Saturday`, `this Saturday`, and time ranges like `10am-1pm` or `10-1pm`. If it finds a date but no time, it uses the configured default time and marks the row for review. If it cannot find a date, it emits a manual lead when `emit_undated_leads: true`.

## Optional Hotplate browser mode

Hotplate exact dates are not in the initial HTML. To try the best-effort browser parser:

```powershell
..\..\.venv\Scripts\python.exe -m pip install playwright
..\..\.venv\Scripts\python.exe -m playwright install chromium
```

Then set this in `config.yaml`:

```yaml
sources:
  - type: hotplate
    use_browser: true
```

Rows from browser-parsed Hotplate dates are marked `needs_review` because storefront layouts can change.

## Practical workflow

1. Add new recurring venues and vendors to `config.yaml` when you notice them in Instagram or Meta posts.
2. Run the scraper for your target window.
3. Review `popups.generated.csv` and `popups.leads.csv`.
4. Fill missing Instagram-only details manually.
5. Paste clean rows into the published Google Sheet.
