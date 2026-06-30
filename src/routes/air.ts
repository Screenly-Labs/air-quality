import { Hono } from 'hono'
import { defaultLocation } from '../constants'

const air = new Hono<{ Bindings: Env }>()

const UPSTREAM_TIMEOUT_MS = 10000

const isTimeout = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

// fetch with a hard timeout. An aborted fetch surfaces as AbortError/
// TimeoutError directly in the Workers runtime, but some runtimes wrap it as
// `TypeError: fetch failed` with the original error on `cause` — callers check
// both via isTimeout().
const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

interface PollutionResponse {
  coord?: { lat: number; lon: number }
  list: Array<{
    dt: number
    main: { aqi: number }
    components: Record<string, number>
  }>
}

interface WeatherMetaResponse {
  name?: string
  sys?: { country?: string }
  timezone?: number
  coord?: { lat: number; lon: number }
}

air.get('/', async (c) => {
  try {
    // Fall back to the default location for both missing AND empty params: a
    // `?lat=&lng=` request yields empty strings (not undefined), so destructuring
    // defaults alone would forward `lat=&lon=` upstream and 502 instead.
    const q = c.req.query()
    const lat = q.lat || defaultLocation.lat
    const lng = q.lng || defaultLocation.lng
    const appid = c.env.OPEN_WEATHER_API_KEY

    // URLSearchParams escapes the values, so a crafted lat/lng can't smuggle a
    // second appid (or any other) param into the upstream URL.
    const pollutionParams = new URLSearchParams({ lat, lon: lng, appid })
    const pollutionUrl =
      `https://api.openweathermap.org/data/2.5/air_pollution/forecast?${pollutionParams.toString()}`

    // The air-pollution endpoint returns no place name / country / timezone, so
    // a second call to the current-weather endpoint supplies that metadata.
    const metaParams = new URLSearchParams({ lat, lon: lng, units: 'metric', appid })
    const metaUrl = `https://api.openweathermap.org/data/2.5/weather?${metaParams.toString()}`

    const timeoutMs = Number(c.env.AIR_TIMEOUT_MS) || UPSTREAM_TIMEOUT_MS

    // Run both upstream calls together. The pollution call is required; the
    // metadata call is best-effort, so its failure must not fail the request.
    const [pollutionResp, metaResp] = await Promise.all([
      fetchWithTimeout(pollutionUrl, timeoutMs),
      fetchWithTimeout(metaUrl, timeoutMs).catch(() => null)
    ])

    if (!pollutionResp.ok) {
      console.log(`Air upstream returned ${pollutionResp.status} ${pollutionResp.statusText}`)
      return c.json({ error: true }, 502)
    }

    const pollution = (await pollutionResp.json()) as PollutionResponse

    // Best-effort city metadata. Any failure (network, non-OK, parse) just
    // leaves city null — the client still renders the index without place/clock.
    let city: { name?: string; country?: string; timezone?: number } | null = null
    let coord = pollution.coord
    if (metaResp?.ok) {
      try {
        const meta = (await metaResp.json()) as WeatherMetaResponse
        city = { name: meta.name, country: meta.sys?.country, timezone: meta.timezone }
        if (meta.coord) {
          coord = { lat: meta.coord.lat, lon: meta.coord.lon }
        }
      } catch (e) {
        console.log(`Air metadata parse failed: ${e}`)
      }
    }

    return c.json({ city, coord, list: pollution.list })
  } catch (e) {
    console.log(e)
    const cause = (e as { cause?: unknown } | null)?.cause
    return c.json({ error: true }, isTimeout(e) || isTimeout(cause) ? 504 : 502)
  }
})

export default air
