import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import manifest from '__STATIC_CONTENT_MANIFEST'
import App from './components/App'
import air from './routes/air'
import { locationHeaders, locationQueryParams, defaultLocation } from './constants'
import { trimCoordinates } from './utils'

const app = new Hono<{ Bindings: Env }>()

// A short, deploy-stable token derived from the hashed static-asset manifest.
// It changes whenever any asset (JS/CSS/font) changes, which is exactly when a
// deploy ships. Folding it into the page-cache key means a new deploy lands on
// a fresh key instead of serving a previously cached HTML shell that points at
// the previous build's assets. Without this, the 12h SSR page cache outlives a
// deploy and pairs stale HTML with freshly served /static assets.
const ASSET_VERSION = (() => {
  const source = typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    hash = (Math.imul(31, hash) + source.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
})()

app.use('*', logger())

// Cache headers for static assets. Asset URLs in the HTML carry ?v=<version>
// (see ASSET_VERSION / the components), so a versioned request is safe to cache
// forever — a content change ships a new ?v and therefore a new URL. Legacy
// unversioned URLs (only referenced by pre-cache-busting HTML still sitting in
// the edge cache) get a short TTL so they can pick up the current bundle.
app.use('/static/*', async (c, next) => {
  await next()
  const versioned = c.req.query('v') !== undefined
  c.header('Cache-Control', versioned
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=300')
})
app.use('/static/*', serveStatic({ root: './', manifest }))

app.get('/', async (c) => {
  const qLat = c.req.query(locationQueryParams.lat)
  const qLng = c.req.query(locationQueryParams.lng)

  // Redirect to a canonical URL whenever either coordinate is missing, filling
  // gaps so the render path always has both lat and lng. Resolution order, most
  // to least specific: explicit query params > the Screenly player's
  // asset-metadata headers > Cloudflare's request IP geolocation > the default.
  // The GeoIP step (request.cf, populated by the Workers runtime at the edge)
  // means browser/no-header traffic lands on the viewer's approximate location
  // instead of always defaulting to San Francisco.
  if (!qLat || !qLng) {
    const cf = (c.req.raw as unknown as { cf?: { latitude?: string; longitude?: string } }).cf
    const lat = qLat || c.req.header(locationHeaders.lat) || cf?.latitude || defaultLocation.lat
    const lng = qLng || c.req.header(locationHeaders.lng) || cf?.longitude || defaultLocation.lng
    const coordinates = trimCoordinates({ lat, lng })

    const url = new URL(c.req.url)
    url.searchParams.set('lat', coordinates.lat)
    url.searchParams.set('lng', coordinates.lng)

    // 302 (temporary), not 301: the resolved location depends on GeoIP / device
    // headers, which change when a sign is relocated or reassigned. A cached 301
    // would pin the screen to its first-seen coordinates forever.
    return new Response(null, {
      status: 302,
      headers: { Location: url.toString() }
    })
  }

  const pageCache = (caches as unknown as { default: Cache }).default
  // hono v4's c.req is a HonoRequest wrapper; the Cache API needs a raw
  // Request. Version the key by the deployed asset bundle so each deploy busts
  // the SSR page cache rather than serving HTML that references stale assets.
  const keyUrl = new URL(c.req.url)
  keyUrl.searchParams.set('v', ASSET_VERSION)
  const key = new Request(keyUrl.toString(), c.req.raw)
  let response = await pageCache.match(key)

  if (!response) {
    const coordinates = trimCoordinates({ lat: qLat, lng: qLng })
    const env = c.env.ENV
    const body = (<App {...coordinates} env={env} v={ASSET_VERSION} />).toString()
    response = new Response(body, {
      status: 200,
      headers: {
        'Cache-Control': 's-maxage=43200',
        'Content-Type': 'text/html; charset=UTF-8'
      }
    })

    c.executionCtx.waitUntil(pageCache.put(key, response.clone()))
  }

  return response
})

app.get('/api/air/*', cache({ cacheName: 'default', cacheControl: 's-maxage=10800' }))
app.route('/api/air', air)

export default app
