# Screenly Air Quality App

A full-screen air-quality display for Screenly digital signage, served from a Cloudflare
Worker. It is a sibling of the [Screenly Weather App](../weather-app): same server-rendered
shell, same build and caching, but the data is air quality instead of weather.

The headline air-quality index is **geo-specific**: locations in the United States and its
territories are shown on the US EPA AQI (0-500) scale, European locations on the European
Air Quality Index (EAQI, 1-6), with EPA used as the default elsewhere. The index is computed
in the browser from the raw pollutant concentrations returned by the API.

This is an example asset for Screenly as part of the
[Screenly Playground](https://github.com/Screenly/playground).

When running on a Screenly device with
[asset metadata enabled](https://github.com/Screenly/playground/blob/master/asset-metadata/README.md),
the location is set automatically. Otherwise it falls back to the player's IP geolocation, then
to a default location.

## Data source

Air-quality data comes from the [OpenWeatherMap Air Pollution
API](https://openweathermap.org/api/air-pollution) (the `/air_pollution/forecast` endpoint),
using the same OpenWeatherMap account and API key as the weather app. Because that endpoint
returns no place name, country or timezone, the worker also calls the current-weather endpoint
for those, and merges both into a single `{ city, list }` payload for the client.

## Requirements

This project uses [Bun](https://bun.sh/) as its package manager. Install dependencies with:

```bash
bun install
```

This installs [Wrangler](https://developers.cloudflare.com/workers/wrangler/) locally. Run it via
`bunx wrangler` (or install it globally with `bun add -g wrangler`).

Login to Cloudflare

```bash
bunx wrangler login
```

Provide the OpenWeatherMap key for local dev in `.dev.vars`:

```
OPEN_WEATHER_API_KEY=your-key-here
```

Run the project in dev mode (builds the client bundle, then starts `wrangler dev` on port 8888):

```bash
bun run dev
```

To make the dev server reachable from other devices on your network, bind it to all interfaces:

```bash
bun run build.ts --client && bunx wrangler dev --ip 0.0.0.0
```

The project is written in **TypeScript** throughout. The browser bundle
(`assets/static/js/main.js`) is compiled from `main.ts`/`locale.ts` by `build.ts` and is a build
artifact (gitignored), so run a build before serving.

Deploy worker

```bash
bunx wrangler deploy --env [environment name]
```
