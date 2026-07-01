import { afterEach, describe, expect, it, mock } from 'bun:test'
import { jsx } from 'hono/jsx'
import App from './components/App'

// The Cloudflare static-assets middleware and its build-time manifest only
// exist in the Workers runtime; stub both before importing the app.
mock.module('__STATIC_CONTENT_MANIFEST', () => ({ default: '{}' }))
mock.module('hono/cloudflare-workers', () => ({
  serveStatic: () => async (_c: unknown, next: () => Promise<void>) => next()
}))

interface CacheLike {
  store?: Map<string, Response>
  match: (k: Request | string) => Promise<Response | undefined>
  put: (k: Request | string, res: Response) => Promise<void>
}

// A Map-backed Cache API stub serving both caches.default (SSR page cache,
// keyed by Request) and caches.open() (the air middleware, keyed by URL).
const makeCache = (): CacheLike => {
  const store = new Map<string, Response>()
  const keyOf = (k: Request | string) => (typeof k === 'string' ? k : k.url)
  // Clone on store/return, mirroring the real Cache API, so a cached Response
  // body is never consumed twice ("Body has already been used").
  return {
    store,
    match: async (k) => store.get(keyOf(k))?.clone(),
    put: async (k, res) => { store.set(keyOf(k), res.clone()) }
  }
}

// hono's cache() middleware decides whether caching is enabled at construction
// time (module load), from globalThis.caches. Define it BEFORE importing the
// app so the real middleware is wired up, not the no-op fallback. (In the
// Workers runtime caches is always defined, so this only matters under test.)
const BASELINE_CACHE = { default: makeCache(), open: async () => makeCache() }
;(globalThis as unknown as { caches: unknown }).caches = BASELINE_CACHE

const app = (await import('.')).default
const ORIGINAL_FETCH = globalThis.fetch

const setCaches = (value: unknown) => {
  ;(globalThis as unknown as { caches: unknown }).caches = value
}

const runWaitUntil = async (promises: Promise<unknown>[]) => { await Promise.all(promises) }

afterEach(() => {
  setCaches(BASELINE_CACHE)
  globalThis.fetch = ORIGINAL_FETCH
})

describe('Routing', () => {
  it('redirects a location-less request to a default location', async () => {
    const res = await app.request('http://localhost/')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('lat=')
    expect(res.headers.get('Location')).toContain('lng=')
  })

  it('redirects when only one coordinate is provided', async () => {
    const res = await app.request('http://localhost/?lat=51.5')
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('lat=51.5')
    expect(location).toContain('lng=')
    // No malformed double query string.
    expect(location.match(/\?/g)).toHaveLength(1)
  })

  // The Workers runtime attaches IP geolocation to request.cf; emulate it here.
  const withCf = (url: string, cf: unknown, headers?: Record<string, string>) => {
    const req = new Request(url, headers ? { headers } : undefined)
    Object.defineProperty(req, 'cf', { value: cf, enumerable: true })
    return req
  }

  it('falls back to Cloudflare GeoIP when no query params or Screenly headers', async () => {
    const res = await app.request(withCf('http://localhost/', { latitude: '40.7128', longitude: '-74.0060' }))
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    // Trimmed to 2 decimals; this is New York, not the SF default.
    expect(location).toContain('lat=40.71')
    expect(location).toContain('lng=-74.01')
  })

  it('prefers Screenly location headers over GeoIP', async () => {
    const res = await app.request(withCf(
      'http://localhost/',
      { latitude: '40.7128', longitude: '-74.0060' },
      { 'x-screenly-lat': '35.68', 'x-screenly-lng': '139.69' }
    ))
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    // Tokyo from the device headers wins over the New York IP.
    expect(location).toContain('lat=35.68')
    expect(location).toContain('lng=139.69')
  })

  it('falls back to the default location when GeoIP is unavailable', async () => {
    const res = await app.request('http://localhost/')
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('lat=37.77')
    expect(location).toContain('lng=-122.43')
  })

  it('renders the page HTML via hono JSX (server-side)', () => {
    // Mirrors the route's `new Response((<App/>).toString())`.
    const body = jsx(App, { env: 'production', lat: '51.5', lng: '-0.12', v: 'testver' }).toString()
    expect(body).toContain('<!DOCTYPE html>')
    expect(body).toContain('id="aqi-item-list"')
    expect(body).toContain('air-fx')
    expect(body).not.toContain('[object Object]')
    // main.js is the bundled self-executing classic script (no ES module
    // export), loaded via a plain async <script> so cached HTML stays
    // compatible across deploys.
    expect(body).toContain('<script src="/static/js/main.js?v=testver" async defer>')
    // Static asset URLs are cache-busted with the deploy version.
    expect(body).toContain('/static/styles/main.css?v=testver')
  })

  it('omits Sentry / GA script tags when no analytics IDs are configured', () => {
    // stage ships with empty sentryIds/gaIds; Layout must render no tags.
    const body = jsx(App, { env: 'stage', lat: '51.5', lng: '-0.12', v: 'testver' }).toString()
    expect(body).not.toContain('sentry-cdn.com')
    expect(body).not.toContain('googletagmanager.com')
  })

  it('renders the GA4 gtag snippet with the production measurement ID', () => {
    const body = jsx(App, { env: 'production', lat: '51.5', lng: '-0.12', v: 'testver' }).toString()
    expect(body).toContain('https://www.googletagmanager.com/gtag/js?id=G-30B61M6PLF')
    expect(body).toContain("gtag('config', 'G-30B61M6PLF')")
  })
})

describe('Page caching (/ route)', () => {
  it('renders on a cache miss, caching under a real Request key with the edge Cache-Control', async () => {
    const keys: (Request | string)[] = []
    const puts: Promise<unknown>[] = []
    setCaches({
      default: {
        match: async (k: Request | string) => { keys.push(k); return undefined },
        put: async (k: Request | string) => { keys.push(k) }
      }
    })
    const ctx = { waitUntil: (p: Promise<unknown>) => puts.push(p), passThroughOnException () {}, props: {} }

    const res = await app.request('http://localhost/?lat=51.5&lng=-0.12', {}, { ENV: 'production' }, ctx)

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<!DOCTYPE html>')
    // 12h shared-cache TTL must survive the migration.
    expect(res.headers.get('Cache-Control')).toBe('s-maxage=43200')
    await runWaitUntil(puts)
    // The page cache key must be a real Request (c.req.raw). hono's HonoRequest
    // wrapper also exposes .url, so assert the concrete type to lock the
    // contract — using c.req would fail this instanceof check.
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(key).toBeInstanceOf(Request)
    // The key must be versioned by the asset bundle so a deploy busts the page
    // cache instead of serving HTML that references the previous build's assets.
    for (const key of keys) expect(new URL((key as Request).url).searchParams.get('v')).toBeTruthy()
  })

  it('serves the cached page on a repeat request without re-rendering', async () => {
    const cached = new Response('CACHED PAGE', { status: 200 })
    setCaches({ default: { match: async () => cached, put: async () => {} } })
    const ctx = { waitUntil () {}, passThroughOnException () {}, props: {} }

    const res = await app.request('http://localhost/?lat=51.5&lng=-0.12', {}, { ENV: 'production' }, ctx)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('CACHED PAGE')
  })
})

describe('Static asset caching (/static/*)', () => {
  it('caches versioned assets immutably and unversioned ones briefly', async () => {
    // Versioned URL (?v=...) is content-addressed via the query, so it is safe
    // to cache forever; the unversioned legacy URL must stay short-lived so old
    // cached HTML can pick up the current bundle.
    const versioned = await app.request('http://localhost/static/js/main.js?v=abc')
    expect(versioned.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')

    const unversioned = await app.request('http://localhost/static/js/main.js')
    expect(unversioned.headers.get('Cache-Control')).toBe('public, max-age=300')
  })
})

describe('Air API caching (/api/air)', () => {
  it('caches a 200 upstream response and serves repeats from cache', async () => {
    const cache = makeCache()
    setCaches({ default: cache, open: async () => cache })

    let fetchCount = 0
    globalThis.fetch = (async (url) => {
      fetchCount++
      const body = String(url).includes('air_pollution')
        ? { coord: { lat: 1, lon: 2 }, list: [] }
        : { name: 'X', sys: { country: 'US' }, timezone: 0 }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }) as typeof fetch

    const puts: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => puts.push(p), passThroughOnException () {}, props: {} }
    const env = { OPEN_WEATHER_API_KEY: 'test-key' }
    const url = 'http://localhost/api/air?lat=1&lng=2'

    const first = await app.request(url, {}, env, ctx)
    expect(first.status).toBe(200)
    // The middleware must apply the 3h shared-cache TTL.
    expect(first.headers.get('Cache-Control')).toContain('s-maxage=10800')
    // The route fans out to both upstream endpoints on a miss.
    expect(fetchCount).toBe(2)

    await runWaitUntil(puts)

    const second = await app.request(url, {}, env, ctx)
    expect(second.status).toBe(200)
    // Served from cache: the upstreams were not hit again.
    expect(fetchCount).toBe(2)
  })
})
