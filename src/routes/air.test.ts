import { afterEach, describe, expect, it } from 'bun:test'
import air from './air'

const env = { OPEN_WEATHER_API_KEY: 'test-key' }
const ctx = { waitUntil () {}, passThroughOnException () {}, props: {} }
const ORIGINAL_FETCH = globalThis.fetch

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const call = (path = 'http://localhost/', e: Record<string, string> = env) =>
  air.fetch(new Request(path), e, ctx)

// The route fans out to two upstream endpoints; route the stub by URL.
const isPollution = (url: unknown) => String(url).includes('air_pollution')

const POLLUTION = {
  coord: { lat: 1, lon: 2 },
  list: [{ dt: 1, main: { aqi: 2 }, components: { pm2_5: 10, pm10: 20, o3: 30, no2: 5 } }]
}
const META = { name: 'Testville', sys: { country: 'US' }, timezone: -25200, coord: { lat: 1.1, lon: 2.2 } }

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe('Air route', () => {
  it('merges the pollution list with city metadata on success', async () => {
    globalThis.fetch = (async (url) => (isPollution(url) ? json(POLLUTION) : json(META))) as typeof fetch

    const res = await call('http://localhost/?lat=1&lng=2')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.city).toEqual({ name: 'Testville', country: 'US', timezone: -25200 })
    expect(body.list).toEqual(POLLUTION.list)
    // Metadata coord (more precise place center) overrides the pollution coord.
    expect(body.coord).toEqual({ lat: 1.1, lon: 2.2 })
  })

  it('escapes query params and the api key in the pollution URL', async () => {
    let pollutionUrl = ''
    globalThis.fetch = (async (url) => {
      if (isPollution(url)) {
        pollutionUrl = String(url)
        return json(POLLUTION)
      }
      return json(META)
    }) as typeof fetch

    // An injection attempt that tries to smuggle a second appid param.
    await call(`http://localhost/?lat=37.77&lng=${encodeURIComponent('-122&appid=evil')}`)

    const url = new URL(pollutionUrl)
    // The injected value must stay a single `lon` param, not a second appid.
    expect(url.searchParams.get('lon')).toBe('-122&appid=evil')
    expect(url.searchParams.getAll('appid')).toEqual(['test-key'])
    expect(url.searchParams.get('lat')).toBe('37.77')
    expect(url.pathname).toContain('/air_pollution/forecast')
  })

  it('still returns the index when metadata is unavailable (city null)', async () => {
    globalThis.fetch = (async (url) => (isPollution(url) ? json(POLLUTION) : json({}, 500))) as typeof fetch

    const res = await call('http://localhost/?lat=1&lng=2')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.city).toBeNull()
    expect(body.list).toEqual(POLLUTION.list)
    // With no metadata, the coord falls back to the pollution payload's.
    expect(body.coord).toEqual(POLLUTION.coord)
  })

  it('returns 502 when the pollution upstream responds with a non-OK status', async () => {
    globalThis.fetch = (async (url) =>
      isPollution(url) ? json({ cod: 401, message: 'Invalid API key.' }, 401) : json(META)) as typeof fetch

    const res = await call('http://localhost/?lat=1&lng=2')

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: true })
  })

  it('returns 504 when the pollution request times out', async () => {
    globalThis.fetch = ((url: string, opts?: RequestInit) => {
      if (!isPollution(url)) return Promise.resolve(json(META))
      // Resolve well past the (tiny) configured timeout, but reject as soon as
      // the route's own AbortController fires, so the timeout path runs.
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(json(POLLUTION)), 200)
        opts?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    }) as typeof fetch

    const res = await call('http://localhost/?lat=1&lng=2', { ...env, AIR_TIMEOUT_MS: '10' })

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: true })
  })

  it('returns 502 when the pollution fetch fails for other reasons', async () => {
    globalThis.fetch = (async (url) => {
      if (isPollution(url)) throw new Error('network down')
      return json(META)
    }) as typeof fetch

    const res = await call('http://localhost/?lat=1&lng=2')

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: true })
  })
})
