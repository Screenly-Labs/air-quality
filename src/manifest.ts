// The self-describing signage-app manifest. Served verbatim (as JSON) from
// /.well-known/signage-app.json so the Screenly app store can render this app's
// config page and signage players can consume its settings directly, instead of
// anyone re-implementing the settings form by hand. See the spec at
// ../../app-store/docs/app-manifest.md and validate against
// ../../app-store/static/schemas/signage-app-manifest.schema.json.
//
// This app takes a single setting: the location. main.ts reads only `lat`/`lng`
// from the URL (see src/index.tsx's resolution order); the AQI standard, locale
// and clock are all derived from that location, not user-configurable. So the
// launch template explodes the location object into `?lat=&lng=`, matching the
// query params the worker already resolves.
export const manifest = {
  manifestVersion: '1',
  id: 'air-quality',
  name: 'Air Quality',
  description:
    'A live air-quality display showing the local AQI, the main pollutant driving it, plain-English guidance and a short forecast. The scale (US EPA or the European Air Quality Index) and the clock are chosen automatically for the location you pick.',
  summary: 'Live local air quality for any display.',
  vendor: 'Screenly',
  tags: ['Air Quality', 'Weather'],
  homepage: 'https://air.srly.io/',
  source: 'https://github.com/Screenly-Labs/air-quality',
  support: 'https://github.com/Screenly-Labs/air-quality/issues',
  // A single static page. It reloads its own air-quality data roughly every two
  // hours (main.ts REFRESH_MS) but never advances through pages of content, so
  // the pacing is fixed rather than stepped.
  playback: {
    pacing: 'fixed',
    refreshIntervalS: 7200
  },
  settings: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      location: {
        type: 'object',
        title: 'Location',
        'x-widget': 'location-map',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' }
        }
      }
    }
  },
  // location* explodes the object into `?lat=&lng=`, the exact params the worker
  // resolves in src/index.tsx. Both coords sit in the one `{?...}` group so
  // whichever is present first takes the `?`.
  launch: {
    baseUrl: 'https://air.srly.io/',
    template: '{?location*}'
  }
} as const
