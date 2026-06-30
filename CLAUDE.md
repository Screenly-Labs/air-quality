# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is the **Screenly Air Quality App**, a sibling of the Screenly Weather App (`../weather-app`).
It is a Cloudflare Worker that server-renders a full-screen air-quality display for Screenly digital
signage, intended to live at `air.srly.io`.

Like the weather app it doubles as a Screenly advertisement: viewers are non-Screenly users, so the
UI carries a rotating CTA pitching Screenly.

## Commands

Package manager is **Bun** (not npm/yarn). CI pins Bun 1.3.14.

```bash
bun install                  # install deps (also installs wrangler locally)
bun run dev                  # build the client bundle, then wrangler dev on port 8888
bun test                     # run all tests
bun test --watch             # watch mode
bun test src/routes/air.test.ts   # run a single test file
bun run typecheck            # tsc --noEmit (no type errors)
bun run lint                 # biome lint, fails on warnings (matches CI)
bun run lint:fix             # biome lint --write
bun run format               # biome format --write
bun run build                # bundle client TS -> main.js + minify CSS in place + vendor fonts
bun run sync-fonts           # vendor @fontsource webfonts into assets/
```

The whole project is **TypeScript** (`.ts`/`.tsx`); there is no plain JS source. To bind the dev
server to the LAN instead of localhost: `bunx wrangler dev --ip 0.0.0.0`.

Local dev needs `OPEN_WEATHER_API_KEY` in `.dev.vars`. Deploy is via wrangler envs:
`bunx wrangler deploy --env [dev|stage|production]`. CI auto-deploys: push to `master` -> stage,
push to `production` -> production. PRs run typecheck + lint + test.

The `OPEN_WEATHER_API_KEY` secret is managed **directly on each Worker**
(`bunx wrangler secret put OPEN_WEATHER_API_KEY --env <stage|production>`), not pushed by CI — Worker
secrets persist across deploys. CI only needs `CF_API_TOKEN` + `CF_ACCOUNT_ID` to authenticate.

## Architecture

### Two runtimes, one repo

1. **Worker (SSR)** — `src/`, TSX via `hono/jsx`. Entry is `src/index.tsx` (wrangler compiles the TS).
2. **Browser (client)** — `assets/static/js/` TypeScript source (`main.ts` + `locale.ts`), compiled
   by `build.ts` into the served `assets/static/js/main.js`. All live behavior (fetching air quality,
   computing the index, clock, locale, CTA rotation) happens here.

The SSR output is a static HTML shell with empty placeholders (`#city`, `#aqi-value`, etc.).
`main.js` fills them in at runtime by calling the worker's own `/api/air` endpoint.

### Request flow (`src/index.tsx`)

- `GET /` redirects (302) to a canonical `?lat=&lng=` URL when either coord is missing. Resolution
  order: query params > Screenly asset-metadata headers (`x-screenly-lat/lng`) > Cloudflare GeoIP
  (`request.cf`) > `defaultLocation`. See `src/constants.ts`.
- With both coords present, the HTML is server-rendered and stored in the edge page cache for 12h.
- `GET /api/air` (`src/routes/air.ts`) proxies the OpenWeatherMap Air Pollution API, keeping
  `OPEN_WEATHER_API_KEY` server-side. Response cached 3h.

### The air-quality data shape (important)

OpenWeatherMap's `/air_pollution/forecast` endpoint returns only `{ coord, list }` — each list item
is `{ dt, main: { aqi }, components: { co, no, no2, o3, so2, pm2_5, pm10, nh3 } }`, concentrations in
µg/m³. It carries **no place name, country or timezone**. So `src/routes/air.ts` also calls the
current-weather endpoint (`/data/2.5/weather`) for `name`/`country`/`timezone` and merges both into
`{ city: { name, country, timezone }, coord, list }` — the same `{ city, list }` shape `main.ts`
consumes. The air-pollution call is required (its failure is a 502/504); the metadata call is
best-effort (on failure `city` is null and the headline still renders, just without the place name; the
clock then approximates its offset from longitude rather than showing UTC).

`main.aqi` is OpenWeatherMap's own 1-5 index and is intentionally **not** used for the headline.
Instead the index is recomputed from the raw `components` so it can be geo-specific (see below).

### Geo-specific AQI (the unit-tested core)

`assets/static/js/locale.ts` holds the pure, unit-tested helpers (mirroring the weather app's
locale/temp split). `resolveAqiStandard(country)` picks the scale by location:

- US family (`US, PR, GU, VI, AS, MP, UM`) -> `epa` (US EPA AQI, 0-500)
- European countries -> `eaqi` (European Air Quality Index, band 1-6)
- everything else -> `epa` (default)

`computeAqi(components, standard)` returns `{ value, severity (1-6), label, dominant, advice }`. EPA
takes the max piecewise-linear sub-index across PM2.5, PM10, O3, NO2, SO2 and CO; PM is used in native
µg/m³, the gases are converted µg/m³→ppb/ppm (25 °C, 1 atm) so a high-ozone, low-particulate day reads
"Unhealthy" rather than "Good". EAQI takes the worst band across PM2.5, PM10, NO2, O3 and SO2. Both map
to a common `severity` 1-6 that drives the CSS accent/background via `body[data-aqi]`. `owmFallback()`
turns OpenWeatherMap's own 1-5 index into a result so the readout is never blank when no raw component
is usable. Add testable logic to `locale.ts`, not `main.ts` — `test/locale.test.ts` imports it directly.

### The client build: main.ts/locale.ts -> served main.js (important)

Browsers can't run TypeScript, so the served `assets/static/js/main.js` is a **build artifact**
(gitignored), produced by `build.ts` from `assets/static/js/main.ts`. `build.ts` bundles `main.ts`
with `Bun.build({ external: [] })`, inlining its `import` of `locale.ts`, so the emitted `main.js` is
a self-executing classic script with **no top-level `export`/`import`** — loadable by every cached
HTML variant (plain `<script>` or `type="module"`) so a deploy never strands cached pages. (A bare
`import` left in the served file is a classic-script parse error -> blank page; this is exactly why
the bundle, never the raw source, is what gets served.) `wrangler.toml`'s `[site] exclude` keeps the
`.ts` source from being served. `main.js` must exist for the worker to serve it, so `bun run dev`
runs `build.ts --client` first (JS-only, leaving the working-tree CSS unminified for editing); the
full `bun run build` also minifies CSS in place.

`ASSET_VERSION` (hash of the static-asset manifest) is folded into the SSR page-cache key and
appended as `?v=` to every asset URL, so each deploy busts both caches together. Read `src/index.tsx`
and the comments in `main.ts`/`Layout.tsx` before touching any of this.

## Conventions

- The project is **TypeScript** end to end (worker, client, build scripts, tests). No `.js`/`.jsx`
  source. `bun run typecheck` (`tsc --noEmit`) must pass; tsconfig.json drives editor + jsx settings.
- **Biome** is the linter+formatter (config in `biome.json`): single quotes, no semicolons, no
  trailing commas, 2-space indent, 100-col width. `bun run lint` fails on warnings.
- Tests use `bun:test` (Bun runs the `.ts` directly). Worker tests stub the Cloudflare-only
  `__STATIC_CONTENT_MANIFEST` and `hono/cloudflare-workers` via `mock.module`, and stub the Cache API.
- No em-dashes in copy or comments.
