// Side-effect import: installs the replaceChildren shim for the older-browser
// degraded mode. Must stay first so the shim is in place before any render.
import './polyfills'
import {
  setLocale,
  getTimeByOffset,
  formatTime,
  formatDate,
  resolveAqiStandard,
  computeAqi,
  owmFallback,
  type AqiResult,
  type AqiStandard,
  type Components
} from './locale'

// This file is the build ENTRY. build.ts bundles it (inlining ./locale) into
// the served assets/static/js/main.js, which is loaded as a PLAIN classic
// <script>. It must therefore stay a self-executing IIFE with NO top-level
// `export`: the testable helpers live in ./locale (bundled in here), and this
// file exports nothing. That keeps the served bundle loadable by every cached
// HTML variant — both a classic <script> tag and a type="module" tag run a
// self-executing script identically — so a deploy never strands cached pages.

interface AirItem {
  dt: number
  main: { aqi: number }
  components: Components
}

interface AirData {
  city: { name?: string; country?: string; timezone?: number } | null
  coord?: { lat: number; lon: number }
  list: AirItem[]
  error?: boolean
}

;(() => {
  let clockTimer: ReturnType<typeof setTimeout>
  let airTimer: ReturnType<typeof setTimeout>
  let refreshTimer: ReturnType<typeof setTimeout>
  let ctaTimer: ReturnType<typeof setInterval>
  let tz = 0
  let aqiStandard: AqiStandard = 'epa'

  const APP_NAME = 'Screenly Air Quality App'

  // Forecast strip: a slot every few hours, looking ahead from now.
  const STRIP_STEP_HOURS = 3
  const STRIP_COUNT = 6

  // Refresh cadence: every 2 hours on success, but retry soon after a failure
  // (transient upstream / boot offline) so the sign isn't blank for 2 hours.
  const REFRESH_MS = 120 * 60 * 1000
  const RETRY_MS = 60 * 1000

  /**
   * Utility Functions
   */
  const generateAnalyticsEvent = (name: string, payload: Record<string, unknown>): void => {
    typeof gtag !== 'undefined' && gtag('event', name, payload)
  }

  const updateContent = (id: string, text: string | number): void => {
    const el = document.querySelector(`#${id}`)
    if (el) el.textContent = String(text)
  }

  const initDateTime = (tzOffset: number): void => {
    tz = tzOffset
    clearTimeout(clockTimer)
    const today = getTimeByOffset(tzOffset)

    updateContent('time', formatTime(today))
    updateContent('date', formatDate(today))

    clockTimer = setTimeout(() => initDateTime(tzOffset), 30000)
  }

  const getLocation = (): { lat: string | null; lng: string | null } => {
    const locationEl = document.querySelector('#location-data')
    return {
      lat: locationEl?.getAttribute('data-location-lat') ?? null,
      lng: locationEl?.getAttribute('data-location-lng') ?? null
    }
  }

  const updateLocation = (name?: string): void => {
    updateContent('city', name || '')
  }

  // Rough timezone offset (seconds) from longitude: 15 degrees per hour. Not
  // DST-aware, but a far better fallback than UTC when the metadata call (which
  // carries the real offset) failed.
  const approxTzOffsetFromLng = (lon?: number): number =>
    typeof lon === 'number' ? Math.round(lon / 15) * 3600 : 0

  // The reactive accent + background are driven entirely by the AQI severity
  // (1-6) via body[data-aqi]; the CSS interpolates the accent on change.
  const setAccent = (severity: number): void => {
    document.body.dataset.aqi = String(severity)
  }

  const updateCurrentAqi = (aqi: AqiResult): void => {
    updateContent('aqi-value', aqi.value)
    updateContent('aqi-category', aqi.label)
    updateContent('aqi-scale', aqi.standardLabel)
    // Plain-English guidance — the line that tells a passer-by what to do.
    updateContent('aqi-advice', aqi.advice)
    // A friendly, jargon-free note on what's driving the reading.
    updateContent('detail', aqi.dominant ? `Main pollutant: ${aqi.dominant}` : '')
  }

  const findCurrentItem = (list: AirItem[]): number => {
    const currentUTC = Math.round(Date.now() / 1000)
    let itemIndex = 0

    while (itemIndex < list.length - 1 && list[itemIndex].dt < currentUTC) {
      itemIndex++
    }

    if (itemIndex > 0) {
      const timeDiffFromPrev = currentUTC - list[itemIndex - 1].dt
      const timeDiffFromCurrent = list[itemIndex].dt - currentUTC

      if (timeDiffFromPrev < timeDiffFromCurrent) {
        itemIndex = itemIndex - 1
      }
    }

    return itemIndex
  }

  // Compute the index for a forecast item, falling back to OWM's own 1-5 index
  // if no raw component is usable, so a slot is never silently empty.
  const itemAqi = (item: AirItem): AqiResult | null =>
    computeAqi(item.components, aqiStandard) ?? owmFallback(item.main?.aqi)

  const renderStrip = (list: AirItem[], currentIndex: number): void => {
    const container = document.querySelector('#aqi-item-list')
    const dummyNode = document.querySelector<HTMLElement>('.dummy-node')
    if (!container || !dummyNode) return

    const frag = document.createDocumentFragment()

    // Keep scanning forward until STRIP_COUNT columns are filled (or the list
    // runs out), so a data-less slot is skipped rather than collapsing the strip
    // to fewer columns.
    let added = 0
    for (let i = 0; added < STRIP_COUNT; i++) {
      const idx = currentIndex + i * STRIP_STEP_HOURS
      if (idx >= list.length) break

      const item = list[idx]
      const aqi = itemAqi(item)
      if (!aqi) continue

      const node = dummyNode.cloneNode(true) as HTMLElement
      node.classList.remove('dummy-node')
      node.dataset.aqi = String(aqi.severity)
      const aqiEl = node.querySelector('.item-aqi')
      const timeEl = node.querySelector('.item-time')
      if (aqiEl) aqiEl.textContent = String(aqi.value)
      if (timeEl) timeEl.textContent = idx === currentIndex ? 'Now' : formatTime(getTimeByOffset(tz, item.dt))

      frag.appendChild(node)
      added++
    }

    container.replaceChildren(frag)
  }

  const updateAir = (list: AirItem[]): void => {
    clearTimeout(airTimer)
    if (!Array.isArray(list) || list.length === 0) return

    const currentIndex = findCurrentItem(list)
    const currentItem = list[currentIndex]
    const aqi = itemAqi(currentItem)

    if (aqi) {
      updateCurrentAqi(aqi)
      setAccent(aqi.severity)
    }

    renderStrip(list, currentIndex)

    // Re-evaluate against the local forecast list every 10 minutes so the
    // "current" reading rolls forward without a network round-trip.
    airTimer = setTimeout(() => updateAir(list), 10 * 60 * 1000)
  }

  const updateData = (data: AirData): void => {
    // The API returns { error: true } on upstream failures; skip those.
    if (!Array.isArray(data?.list)) return

    const country = data.city?.country
    aqiStandard = resolveAqiStandard(country)
    setLocale(country)
    updateLocation(data.city?.name)

    // The air-pollution feed has no timezone; the metadata call supplies it.
    // If metadata was unavailable, approximate the offset from longitude
    // (15 deg per hour) so the clock is roughly local instead of UTC.
    const tzOffset = typeof data.city?.timezone === 'number'
      ? data.city.timezone
      : approxTzOffsetFromLng(data.coord?.lon)
    initDateTime(tzOffset)

    updateAir(data.list)

    generateAnalyticsEvent('location', {
      app_name: APP_NAME,
      city: data.city?.name,
      country
    })
  }

  /**
   * Fetch air quality
   */
  const fetchAir = async (): Promise<void> => {
    clearTimeout(refreshTimer)
    let ok = false
    try {
      const { lat, lng } = getLocation()
      const response = await fetch(`/api/air?lat=${lat}&lng=${lng}`)
      const data = (await response.json()) as AirData
      // /api/air returns { error: true } with a 4xx/5xx on upstream failure.
      ok = response.ok && Array.isArray(data?.list)
      if (ok) updateData(data)
    } catch (e) {
      console.log(e)
    }
    // Full interval on success; a short retry after a failure so a transient
    // outage doesn't leave the sign blank until the next 2-hour tick.
    refreshTimer = setTimeout(fetchAir, ok ? REFRESH_MS : RETRY_MS)
  }

  /**
   * Rotating Screenly call-to-action.
   *
   * The banner is only shown on non-Screenly devices (a browser tab or a rival
   * signage system), so the copy pitches the viewer to switch to Screenly. It
   * is non-interactive (a digital sign has no cursor/touch) and surfaces
   * screenly.io as the destination a viewer types in themselves.
   */
  const ctaMessages = [
    'Powerful, secure, simple digital signage',
    'Secure by default: SOC 2, zero-trust',
    'Manage every screen from anywhere',
    'Run Screenly on hardware you already own',
    'Powering 10,000+ screens worldwide'
  ]
  let ctaIndex = 0

  const rotateCta = (): void => {
    const msg = document.querySelector('#cta-msg')
    if (!msg) return

    ctaIndex = (ctaIndex + 1) % ctaMessages.length
    const next = ctaMessages[ctaIndex]
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

    if (reduceMotion) {
      msg.textContent = next
      return
    }

    msg.classList.add('is-out')
    setTimeout(() => {
      msg.textContent = next
      msg.classList.remove('is-out')
    }, 450)
  }

  const setBanner = (): void => {
    const banner = document.querySelector('.upgrade-banner')
    const { userAgent } = navigator
    const isScreenlyDevice = userAgent.includes('screenly-viewer')

    if (banner && !isScreenlyDevice) {
      banner.classList.add('visible')
      clearInterval(ctaTimer)
      ctaTimer = setInterval(rotateCta, 5000)
    }

    generateAnalyticsEvent('device', {
      app_name: APP_NAME,
      screenly_device: isScreenlyDevice
    })
  }

  const init = (): void => {
    // fetchAir() reschedules itself every 2 hours.
    fetchAir()
    setBanner()
  }

  // Only auto-run in a real browser; under a test runner there is no document.
  // The script is loaded async, so wait for the DOM before reading elements.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init)
    } else {
      init()
    }
  }
})()
