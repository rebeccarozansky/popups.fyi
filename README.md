# popups.fyi

A mobile-first map of bakery and cafe pop-ups. Reads from a publicly-published Google Sheet (CSV), renders an interactive Leaflet map with a draggable bottom sheet list. No backend, no API keys, no auth — it's a static bundle deployed to GitHub Pages.

The initial city is Seattle; the schema and code support any US city. Only the default map center and the "today" timezone anchor are Seattle-specific.

## Local development

```bash
npm install
npm run dev
```

The dev server runs against `public/popups.sample.csv` by default, so you don't need to set up a Google Sheet to get going. To point at a real sheet locally, create a `.env.local` file:

```
VITE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&single=true&output=csv
```

## Setting up the live data source

1. **Create a Google Sheet** with the column headers listed in the schema below (exact names, lowercase, including underscores).
2. **Add one row per pop-up event.** For `lat`/`lng`, the easiest workflow is: open Google Maps, right-click the venue, and click the coordinates at the top of the menu — that copies the exact decimal lat/lng to your clipboard.
3. **Publish the sheet as CSV.** In the Sheet: `File → Share → Publish to web`. Choose the tab you want, set the format to `Comma-separated values (.csv)`, and click `Publish`.
4. **Copy the published URL.** It looks like `https://docs.google.com/spreadsheets/d/e/<long-id>/pub?gid=0&single=true&output=csv`.
5. **Set `VITE_SHEET_CSV_URL` as a repo secret** for the deploy workflow: `Settings → Secrets and variables → Actions → New repository secret`. Name `VITE_SHEET_CSV_URL`, value is the URL from step 4.

The next push to `main` will rebuild against the live sheet.

## Custom domain (popups.fyi)

`public/CNAME` contains the bare domain `popups.fyi`, which GitHub Pages picks up during deploy.

DNS records:

| Type  | Host | Value                                                        |
| ----- | ---- | ------------------------------------------------------------ |
| A     | @    | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| AAAA  | @    | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | www  | `<your-github-username>.github.io.`                          |

After DNS propagates, enable "Enforce HTTPS" in the repo's Pages settings.

If you'd rather deploy to `username.github.io/popups.fyi/` instead of a custom domain, delete `public/CNAME` and change `base` in `vite.config.js` from `'/'` to `'/popups.fyi/'`.

## Schema

| Column            | Type   | Required | Notes                                                |
| ----------------- | ------ | -------- | ---------------------------------------------------- |
| `id`              | string | yes      | unique row identifier                                |
| `name`            | string | yes      | pop-up / vendor name                                 |
| `location_name`   | string | no       | host venue                                           |
| `start_datetime`  | string | yes      | local wall-clock, `YYYY-MM-DDTHH:MM`                 |
| `end_datetime`    | string | yes      | local wall-clock, `YYYY-MM-DDTHH:MM`                 |
| `timezone`        | string | yes      | IANA name, e.g. `America/Los_Angeles`                |
| `address`         | string | no       | freeform display string                              |
| `lat`             | number | yes      | latitude, decimal degrees                            |
| `lng`             | number | yes      | longitude, decimal degrees                           |
| `city`            | string | yes      |                                                      |
| `neighborhood`    | string | no       |                                                      |
| `instagram_url`   | string | no       | full URL                                             |
| `order_url`       | string | no       | full URL (Hotplate, Square, etc.)                    |
| `category`        | string | no       | one of `bakery`, `coffee`, `matcha`, `pastry`, `other` |
| `notes`           | string | no       | short freeform description                           |
| `image_url`       | string | no       | full URL to a photo                                  |

Empty optional fields render nothing — no "N/A", no empty placeholders.

## Adding new cities later

The schema already supports `city`, so adding new cities is a data-only change in the live sheet — no code changes are required for the pop-ups to show up on the map. The only Seattle-specific code is:

- `DEFAULT_CENTER` and `DEFAULT_ZOOM` in `src/lib/config.js` (the initial map view before geolocation runs)
- `ANCHOR_TIMEZONE` in `src/lib/config.js` (used to interpret "today" / "this weekend" / "this week" filters)

A future multi-city version would either let the user pick a city or derive the anchor zone from the browser locale.

## Caching

On startup, `usePopups` reads from `localStorage` (`popups.fyi:cache`) for instant first paint, then always refreshes from the network in the background. If the network fetch fails and there's cached data, a small "data may be stale" indicator appears. If both fail, the list shows a Retry button.

## Tech

Vite · React 18 · Tailwind · Leaflet (CartoDB Positron tiles) · leaflet.markercluster · Papa Parse · Luxon.
