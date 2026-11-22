# popups.fyi

A mobile-first map of bakery and cafe pop-ups. Reads from a publicly-published Google Sheet (CSV), renders an interactive MapLibre vector map (smooth zoom, sharp labels at every level) with a draggable bottom sheet list. No backend, no API keys, no auth — it's a static bundle deployed to GitHub Pages.

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

To see the site the way it ships — prerendered pages, real status codes — build it and serve `dist/` with the GitHub Pages-style server:

```bash
npm run build
npm run serve:pages   # http://127.0.0.1:4173
npm run seo:check     # what a crawler without JavaScript sees
npm test              # slug and cover unit tests
```

## Instagram maps and captions

With the local site running, [tools/instagram-shot/shot.mjs](tools/instagram-shot/shot.mjs) saves a post-ready map PNG, a cover image and caption text for one city:

```bash
node tools/instagram-shot/shot.mjs --city seattle --from 2026-09-17 --to 2026-09-22 --url http://127.0.0.1:5173
node tools/instagram-shot/shot.mjs --city sanfrancisco --from 2026-09-17 --to 2026-09-22 --url http://127.0.0.1:5173
```

Custom dates are inclusive (up to 14 days). Like the site, the generator excludes events that have already ended. Without dates it uses the `week` filter; `--when today` and `--when weekend` are also available.

The caption lists each pop-up with its vendor's handle, then residencies in their own section, then the city's hashtags. Residencies only appear when `VITE_RESIDENCY_CSV_URL` is set in `.env.local`.

The cover is a title card for the first slide — Pip above "Pop-Ups in Seattle for Sep 17–22" — saved as a `-cover.jpg` the same size as the map. `--mascot <file>` swaps Pip for another SVG, PNG, JPG or WebP image for that run.

Outputs go to `screenshots/` with a shared city/date basename. Use `--out` or `--name` to change the destination or basename, and `--no-caption` to skip the text. The default portrait image is **1080 × 1350**; `--format square` (1080 × 1080) and `--format story` (1080 × 1920) are also available.

## Manual pop-up scraping helper

There is a standalone Python helper in [tools/popup-scraper](tools/popup-scraper) for manually collecting upcoming Seattle pop-up candidates from Hotplate, Eventbrite, saved Instagram/Facebook/Threads captions, JSON-LD event pages, and public calendar feeds. It is not part of the website bundle. See [tools/popup-scraper/README.md](tools/popup-scraper/README.md) for setup, time-frame options, and output files.

## Setting up the live data source

1. **Create a Google Sheet** with the column headers listed in the schema below (exact names, lowercase, including underscores).
2. **Add one row per pop-up event.** For `lat`/`lng`, the easiest workflow is: open Google Maps, right-click the venue, and click the coordinates at the top of the menu — that copies the exact decimal lat/lng to your clipboard.
3. **Publish the sheet as CSV.** In the Sheet: `File → Share → Publish to web`. Choose the tab you want, set the format to `Comma-separated values (.csv)`, and click `Publish`.
4. **Copy the published URL.** It looks like `https://docs.google.com/spreadsheets/d/e/<long-id>/pub?gid=0&single=true&output=csv`.
5. **Set `VITE_SHEET_CSV_URL` as a repo secret** for the deploy workflow: `Settings → Secrets and variables → Actions → New repository secret`. Name `VITE_SHEET_CSV_URL`, value is the URL from step 4.

The next push to `main` will rebuild against the live sheet, and from then on the site rebuilds every hour (see [Prerendering and search](#prerendering-and-search)).

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
| `category`        | string | no       | one or more of `bakery`, `coffee`, `matcha`, `savory`, `other` (comma-separated) |
| `notes`           | string | no       | short freeform description                           |
| `image_url`       | string | no       | full URL to a photo                                  |

Empty optional fields render nothing — no "N/A", no empty placeholders.

## Residencies

A residency is a vendor with a standing weekly slot at a host venue ("every Sat & Sun, 9–1, through Dec 20"). Residencies come from a second, optional sheet with **one row per residency**, not one per date. The site expands each schedule into dates, lists each residency once (at its next slot inside the active date window), keeps its usual category icon on the map with a small house tucked into the icon's top-right corner like an exponent, tags its card "Residency", and adds a **Residencies** switch to the filter bar. Switching it off is kept in the URL as `?res=0`.

Like the main sheet, the residency sheet's CSV URL is set through `VITE_RESIDENCY_CSV_URL` — in `.env.local` locally and as a repo secret of the same name for deploys (`Settings → Secrets and variables → Actions → New repository secret`). Use the sheet's export link: `https://docs.google.com/spreadsheets/d/<sheet-id>/export?format=csv&gid=0`. Unset means residencies are off (no switch, no residency cards or pins); there is deliberately no sample fallback, so a missing setting can't slip sample vendors into an Instagram post. Keep the sheet's link sharing on **Viewer** — the URL ends up in the public site bundle. To preview with [public/residencies.sample.csv](public/residencies.sample.csv), set `VITE_RESIDENCY_CSV_URL=/residencies.sample.csv` in `.env.local`. If the sheet's header row is missing any of the required columns below, the browser console says which ones.

Columns match the main schema, except `start_datetime` / `end_datetime` are replaced by:

| Column        | Type   | Required | Notes                                                                 |
| ------------- | ------ | -------- | --------------------------------------------------------------------- |
| `days`        | string | yes      | e.g. `Sat, Sun`, `Sat & Sun`, `Fri-Sun`, `Wed to Fri`, `weekends`, `daily` |
| `start_time`  | string | yes      | local wall-clock, e.g. `9:00`, `9:00 AM`, `9am`                       |
| `end_time`    | string | yes      | same formats; earlier than `start_time` means it runs past midnight   |
| `start_date`  | string | yes      | first day, `YYYY-MM-DD` (or `M/D/YYYY`)                               |
| `end_date`    | string | no       | last day; blank = ongoing                                             |
| `skip_dates`  | string | no       | comma-separated days off, e.g. `2026-11-26, 2026-12-24`               |

Residency ids are prefixed with `res-` in the app, so they never collide with pop-up ids in saved lists or share links.

**Different hours on different days.** If a vendor's residency keeps different hours on different days at the same venue (say Tue 11–5 and Fri 6–10), add one row per set of hours. Rows with the same `name` at the same spot (within ~50 m) are shown as a single residency — one card, one pin, one saved item — with its card reading "Every Tue 11 AM–5 PM, Fri 6–10 PM". It keeps the first row's `id`, and notes from every row are kept. Each row can have its own `start_date`, `end_date` and `skip_dates`.

## Cities

The site is served per city at `popups.fyi/<slug>`:

| URL                        | City                                    |
| -------------------------- | --------------------------------------- |
| `popups.fyi`               | Seattle (default — the bare domain)     |
| `popups.fyi/seattle`       | Seattle                                 |
| `popups.fyi/sanfrancisco`  | San Francisco                           |
| `popups.fyi/raleigh`       | Raleigh (and the Research Triangle)     |

The city name in the wordmark (`popups.fyi/<city>`) is a dropdown; picking a city pushes the new path and keeps the active date filter. The end of the list also links to the other cities. `/sf`, `/san-francisco` and `/san_francisco` redirect to San Francisco, `/sea` to Seattle and `/rdu` to Raleigh (keeping any filters in the query string), and an unknown path falls back to the default city.

A pop-up is assigned to a city by its `city` cell when that name is a known alias, otherwise by whether its coordinates fall inside the city's metro bounding box — so suburb rows (Bothell, Renton, Oakland, Durham, …) stay attached to the right metro without extra bookkeeping. Set each row's `timezone` to its city's zone (`America/New_York` for Raleigh).

To add another city, append an entry to `CITIES` in [src/lib/cities.js](src/lib/cities.js) with its slug, map center, timezone, state (`region`), country, metro bounds, and city-name aliases. The build then prerenders its pages too; run `npm run og:images` to draw its share image and commit `public/og/<slug>.png`. For Instagram posts, also add the city to `CITIES` and `HASHTAGS` in [tools/instagram-shot/shot.mjs](tools/instagram-shot/shot.mjs).

Every city has a real page (`dist/seattle.html` and so on, see below), so a direct hit on `popups.fyi/seattle` gets a 200. Any other path gets `dist/404.html`, which still boots the app: it falls back to a city, and opens a pop-up whose page address it recognizes.

## Prerendering and search

The map is a client-side app, but every public page is also written out as real HTML at build time, so search engines and AI crawlers that don't run JavaScript can read it, and link previews show the right title and image.

**How it works.** `npm run build` runs three steps:

1. `vite build` — the app, into `dist/`.
2. `vite build --ssr src/prerender/entry.js --outDir dist-ssr` — the page renderer in [src/prerender](src/prerender), bundled by Vite so it reads `VITE_SHEET_CSV_URL` / `VITE_RESIDENCY_CSV_URL` exactly as the app does (including the sample-sheet fallback). `dist-ssr/` is gitignored.
3. `node scripts/prerender.mjs` — fetches both sheets (three tries each), renders the pages with the app's own components and `src/lib` helpers, and writes them into `dist/` using the built `dist/index.html` as the template. If the main sheet can't be fetched or has no rows, or a configured residency sheet can't be fetched, the build fails and the last good deploy stays live.

What it writes:

| Page | File | Notes |
| --- | --- | --- |
| `/`, `/seattle`, `/sanfrancisco`, `/raleigh` | `index.html`, `<city>.html` | The app, with a static copy of the This Week list inside `#root` and the build's copy of the sheets embedded, so the list shows before the network answers. `/` points search engines at `/seattle`. |
| `/<city>/popups/<slug>` | `<city>/popups/<slug>.html` | Upcoming pop-ups and ones that ended in the last 30 days (those say so and are `noindex`). Slug: vendor, venue and date. |
| `/<city>/vendors/<slug>` | … | Vendors with something upcoming, a residency, or a pop-up in the last 90 days. |
| `/<city>/residencies/<slug>` | … | Running residencies, and for 30 days after they end. |
| `/sf`, `/san-francisco`, `/san_francisco`, `/sea`, `/rdu` | `<shortcut>.html` | Redirects to the city, keeping the query string. |
| anything else | `404.html` | Boots the app (status 404, `noindex`). |

Plus `sitemap.xml` (canonical, indexable pages only) and `robots.txt`. Pages are written as `<route>.html` because GitHub Pages serves `/seattle` from `seattle.html` with a 200, while `seattle/index.html` would redirect to `/seattle/` first. Slugs, page addresses and which items get a page live in [src/lib/pages.js](src/lib/pages.js), which the app uses too: Share copies a pop-up's page URL, and a page address that reaches the app (a row added since the last build, or a page past its 30 days) opens like a `?id=` link.

Each page has its own title and description, a canonical URL on `https://popups.fyi`, Open Graph/Twitter tags with a share image from [public/og](public/og), and JSON-LD built only from the sheet: an `Event` on pop-up pages and for a residency's next date, breadcrumbs on nested pages, and the site's name on `/`. City and vendor pages have no `Event` markup, because Google's event results only use pages about a single event.

**What runs hourly.** [.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds and deploys on every push to `main`, every hour (at :17), when started by hand from the Actions tab, and on a `sheet-updated` [repository dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) — so the sheet can ask for a rebuild right after an edit. Each run checks the build with `npm run seo:check` before uploading it. GitHub turns scheduled workflows off in public repositories after 60 days without activity in the repository; if pages stop updating, re-enable the workflow from the Actions tab (any push also resets the clock).

To trigger a rebuild from the sheet, create a fine-grained personal access token for this repository with **Contents: read and write**, save it in the sheet's Apps Script project as a script property (`Project Settings → Script properties`, name `GITHUB_TOKEN`) rather than in a cell, and call:

```js
function requestRebuild() {
  UrlFetchApp.fetch('https://api.github.com/repos/rebeccarozansky/popups.fyi/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
    },
    payload: JSON.stringify({ event_type: 'sheet-updated' }),
  });
}
```

(Rapid edits each start a run; the workflow cancels the older one, so the last edit wins.)

**Checks.** `npm run seo:check` serves `dist/` with [scripts/serve-pages.mjs](scripts/serve-pages.mjs), which answers like GitHub Pages (`vite preview` returns 200 for every path, which would hide a missing page), and fetches the pages without JavaScript: status codes, one `<h1>`, title, description, canonical, `og:title`/`og:image`, real listings or the empty-state message, JSON-LD that parses, and that every sitemap URL is a 200, self-canonical and indexable, and every internal link resolves.

**Share images.** `npm run og:images` draws `public/og/<city>.png`, `default.png` and `logo.png` with the Instagram cover's design in a 1200 × 630 landscape layout. They're committed; re-run it after adding a city.

**Adding a page type.** Build its page objects in [src/prerender/site.jsx](src/prerender/site.jsx) (`popupPage` shows the fields the script expects: `path`, `file`, `url`, `title`, `description`, `head`, `root`, `app`, `indexable`), add its component next to [src/prerender/PopupPage.jsx](src/prerender/PopupPage.jsx), put any address helpers in [src/lib/pages.js](src/lib/pages.js) so the app agrees, and teach [scripts/seo-check.mjs](scripts/seo-check.mjs) its kind. Indexable pages go into the sitemap automatically. New components belong under `src/` so Tailwind picks up their classes.

## Caching

On startup, `usePopups` renders straight away from the newest copy it has: the sheets embedded in a prerendered city page by the build, or `localStorage` (`popups.fyi:cache`). It then always refreshes from the network in the background. If the network fetch fails and there's a copy, a small "data may be stale" indicator appears. If both fail, the list shows a Retry button.

## Tech

Vite · React 18 · Tailwind · MapLibre GL JS ([OpenFreeMap](https://openfreemap.org) Positron vector tiles; set `VITE_MAP_STYLE_URL` to use any other MapLibre style) · Supercluster · Papa Parse · Luxon.
