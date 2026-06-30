// Locale, formatting and pure air-quality helpers, extracted from main.ts so
// they can be unit-tested with a real ES module import. build.ts bundles this
// into the served main.js; keeping these here (and OUT of main.ts) is what lets
// the bundled main.js stay a plain self-executing browser script with no
// `export` token - see the build note in main.ts / Layout.tsx.

const locales: Record<string, string> = JSON.parse('{"AF":"ps-AF","AL":"sq-AL","DZ":"ar-DZ","AS":"en-AS","AD":"ca","AO":"pt","AI":"en","AQ":"en-US","AG":"en","AR":"es-AR","AM":"hy-AM","AW":"nl","AU":"en-AU","AT":"de-AT","AZ":"az-Cyrl-AZ","BS":"en","BH":"ar-BH","BD":"bn-BD","BB":"en","BY":"be-BY","BE":"nl-BE","BZ":"en-BZ","BJ":"fr-BJ","BM":"en","BT":"dz","BO":"es-BO","BQ":"nl","BA":"bs-BA","BW":"en-BW","BV":"no","BR":"pt-BR","IO":"en","BN":"ms-BN","BG":"bg-BG","BF":"fr-BF","BI":"fr-BI","CV":"kea-CV","KH":"km-KH","CM":"fr-CM","CA":"en-CA","KY":"en","CF":"fr-CF","TD":"fr-TD","CL":"es-CL","CN":"zh-CN","CX":"en","CC":"en","CO":"es-CO","KM":"fr-KM","CD":"fr-CD","CG":"fr-CG","CK":"en","CR":"es-CR","HR":"hr-HR","CU":"es","CW":"nl","CY":"el-CY","CZ":"cs-CZ","CI":"fr-CI","DK":"da-DK","DJ":"fr-DJ","DM":"en","DO":"es-DO","EC":"es-EC","EG":"ar-EG","SV":"es-SV","GQ":"fr-GQ","ER":"ti-ER","EE":"et-EE","SZ":"en","ET":"am-ET","FK":"en","FO":"fo-FO","FJ":"en","FI":"fi-FI","FR":"fr-FR","GF":"fr","PF":"fr","TF":"fr","GA":"fr-GA","GM":"en","GE":"ka-GE","DE":"de-DE","GH":"ak-GH","GI":"en","GR":"el-GR","GL":"kl-GL","GD":"en","GP":"fr-GP","GU":"en-GU","GT":"es-GT","GG":"en","GN":"fr-GN","GW":"pt-GW","GY":"en","HT":"fr","HM":"en","VA":"it","HN":"es-HN","HK":"en-HK","HU":"hu-HU","IS":"is-IS","IN":"hi-IN","ID":"id-ID","IR":"fa-IR","IQ":"ar-IQ","IE":"en-IE","IM":"en","IL":"he-IL","IT":"it-IT","JM":"en-JM","JP":"ja-JP","JE":"en","JO":"ar-JO","KZ":"kk-Cyrl-KZ","KE":"ebu-KE","KI":"en","KP":"ko","KR":"ko-KR","KW":"ar-KW","KG":"ky","LA":"lo","LV":"lv-LV","LB":"ar-LB","LS":"en","LR":"en","LY":"ar-LY","LI":"de-LI","LT":"lt-LT","LU":"fr-LU","MO":"zh-Hans-MO","MG":"fr-MG","MW":"en","MY":"ms-MY","MV":"dv","ML":"fr-ML","MT":"en-MT","MH":"en-MH","MQ":"fr-MQ","MR":"ar","MU":"en-MU","YT":"fr","MX":"es-MX","FM":"en","MD":"ro-MD","MC":"fr-MC","MN":"mn","ME":"sr-Cyrl-ME","MS":"en","MA":"ar-MA","MZ":"pt-MZ","MM":"my-MM","NA":"en-NA","NR":"en","NP":"ne-NP","NL":"nl-NL","AN":"nl-AN","NC":"fr","NZ":"en-NZ","NI":"es-NI","NE":"fr-NE","NG":"ha-Latn-NG","NU":"en","NF":"en","MK":"mk-MK","MP":"en-MP","NO":"nb-NO","OM":"ar-OM","PK":"en-PK","PW":"en","PS":"ar","PA":"es-PA","PG":"en","PY":"es-PY","PE":"es-PE","PH":"en-PH","PN":"en","PL":"pl-PL","PT":"pt-PT","PR":"es-PR","QA":"ar-QA","RO":"ro-RO","RU":"ru-RU","RW":"fr-RW","RE":"fr-RE","BL":"fr-BL","SH":"en","KN":"en","LC":"en","MF":"fr-MF","PM":"fr","VC":"en","WS":"sm","SM":"it","ST":"pt","SA":"ar-SA","SN":"fr-SN","RS":"sr-Cyrl-RS","SC":"fr","SL":"en","SG":"en-SG","SX":"nl","SK":"sk-SK","SI":"sl-SI","SB":"en","SO":"so-SO","ZA":"af-ZA","GS":"en","SS":"en","ES":"es-ES","LK":"si-LK","SD":"ar-SD","SR":"nl","SJ":"no","SE":"sv-SE","CH":"fr-CH","SY":"ar-SY","TW":"zh-Hant-TW","TJ":"tg","TZ":"asa-TZ","TH":"th-TH","TL":"pt","TG":"fr-TG","TK":"en","TO":"to-TO","TT":"en-TT","TN":"ar-TN","TR":"tr-TR","TM":"tk","TC":"en","TV":"en","UG":"cgg-UG","UA":"uk-UA","AE":"ar-AE","GB":"en-GB","UM":"en-UM","US":"en-US","UY":"es-UY","UZ":"uz-Cyrl-UZ","VU":"bi","VE":"es-VE","VN":"vi-VN","VG":"en","VI":"en-VI","WF":"fr","EH":"es","YE":"ar-YE","ZM":"bem-ZM","ZW":"en-ZW","AX":"sv","XK":"sq"}')

// Default locale when the country is unknown. en-GB gives 24h time and
// neutral English month/day names (better for signage than the player's
// own device locale, which is effectively random).
const FALLBACK_LOCALE = 'en-GB'

// Right-to-left primary language subtags that appear in the locale map.
const rtlLanguages = ['ar', 'fa', 'he', 'ps', 'dv', 'ur', 'ckb', 'sd', 'yi']

// BCP-47 locale for the displayed location, plus cached Intl formatters.
let locale = 'en-GB'
let timeFormatter: Intl.DateTimeFormat
let dateFormatterLong: Intl.DateTimeFormat
let dateFormatterShort: Intl.DateTimeFormat

// Build a time formatter that lets Intl pick 12h vs 24h per locale, but pads
// the hour to two digits when the locale uses a 24-hour clock — so the forecast
// strip aligns (01:00 / 09:00 / 19:00). 12-hour locales keep the natural
// unpadded "4:26 PM" rather than an odd "04:26 PM".
const makeTimeFormatter = (loc: string): Intl.DateTimeFormat => {
  const probe = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' })
  const opts: Intl.DateTimeFormatOptions = probe.resolvedOptions().hour12
    ? { hour: 'numeric', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' }
  return new Intl.DateTimeFormat(loc, opts)
}

const buildFormatters = (): void => {
  // Pin the Gregorian calendar so the date always matches the (Gregorian)
  // forecast — otherwise locales like ar-SA would render a Hijri date.
  // Names, ordering and numerals stay localized.
  //
  // Keep each date format internally consistent in how it abbreviates: the long
  // form spells out both the weekday and the month ("Monday 29 June"), the short
  // form abbreviates both ("Mon 29 Jun"). Mixing a full weekday with a short
  // month read as inconsistent (and made English differ from locales whose
  // "short" month is already a full word).
  const dateLongOpts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', calendar: 'gregory' }
  const dateShortOpts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', calendar: 'gregory' }
  try {
    // Intl picks 12h vs 24h, localized month/day names and AM/PM per locale.
    timeFormatter = makeTimeFormatter(locale)
    dateFormatterLong = new Intl.DateTimeFormat(locale, dateLongOpts)
    dateFormatterShort = new Intl.DateTimeFormat(locale, dateShortOpts)
  } catch {
    // Malformed locale string: fall back rather than break the clock.
    locale = FALLBACK_LOCALE
    timeFormatter = makeTimeFormatter(locale)
    dateFormatterLong = new Intl.DateTimeFormat(locale, dateLongOpts)
    dateFormatterShort = new Intl.DateTimeFormat(locale, dateShortOpts)
  }
}

export const resolveLocale = (code?: string): string => (code && locales[code]) || FALLBACK_LOCALE

export const setLocale = (code?: string): void => {
  locale = resolveLocale(code)
  buildFormatters()
  // The chrome is authored in English (LTR); only the city, date and time
  // render in the location's language. Tag just those elements with the right
  // lang/dir so assistive tech and RTL scripts (e.g. ar) are handled without
  // mirroring the whole LTR layout.
  if (typeof document !== 'undefined') {
    const dir = rtlLanguages.includes(locale.split('-')[0]) ? 'rtl' : 'ltr'
    for (const id of ['city', 'date', 'time']) {
      const el = document.querySelector<HTMLElement>(`#${id}`)
      if (el) {
        el.lang = locale
        el.dir = dir
      }
    }
  }
}

// Build defaults up front so the clock works even before any data arrives.
buildFormatters()

export const getTimeByOffset = (offsetinSecs: number, dt?: number): Date => {
  const now = dt ? new Date(dt * 1000) : new Date()
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000)
  return new Date(utc + (offsetinSecs * 1000))
}

// getTimeByOffset returns a Date whose *local-time* components already read
// as the location's wall clock, so the default-timezone Intl formatters
// (which read the same local components) render the correct local time/date.
export const formatTime = (dateObj: Date): string => timeFormatter.format(dateObj)

export const formatDate = (dateObj: Date): string => {
  const wide = typeof window === 'undefined' || window.innerWidth >= 480
  const formatter = wide ? dateFormatterLong : dateFormatterShort
  return formatter.format(dateObj)
}

/* =========================================================================
   Geo-specific Air Quality Index
   The OpenWeatherMap air-pollution API gives raw pollutant concentrations
   (ug/m3). We recompute a recognizable index from those, choosing the scale by
   location: US family -> US EPA AQI (0-500); Europe -> European EAQI (1-6);
   default -> EPA. Both standards normalize to a `severity` of 1-6 that drives
   the CSS accent/background (body[data-aqi]).
   ========================================================================= */

export type Components = Record<string, number>
export type AqiStandard = 'epa' | 'eaqi'

export interface AqiResult {
  standard: AqiStandard
  standardLabel: string
  value: number
  severity: number
  label: string
  dominant: string
  // Plain-English, one-line health guidance for a general audience.
  advice: string
}

// Plain-English pollutant names (no chemical formulae) for a general audience.
export const POLLUTANT_NAMES: Record<string, string> = {
  pm2_5: 'fine particles',
  pm10: 'dust',
  o3: 'ozone',
  no2: 'nitrogen dioxide',
  so2: 'sulphur dioxide',
  co: 'carbon monoxide',
  nh3: 'ammonia',
  no: 'nitrogen oxide'
}

// One plain-English health sentence per severity band (1 best .. 6 worst). The
// two standards both normalize to this 1-6 severity, so one set of advice fits
// either scale.
const AQI_ADVICE = [
  'Air quality is good — a great time to be outside.',
  'Air quality is acceptable. Enjoy your day as usual.',
  'Air quality is so-so. Sensitive people may want to take it easier outdoors.',
  'Air is unhealthy. Take it easier outdoors, especially if you feel it.',
  'Air is very unhealthy. Try to limit your time outside.',
  'Air is hazardous. Stay indoors and keep windows closed if you can.'
]

// European countries (EU27 + EFTA + UK + microstates + Western Balkans + a few
// eastern neighbours) shown on the European Air Quality Index.
const europeanCountries = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'CH', 'GB', 'AD', 'MC', 'SM', 'VA', 'AL', 'BA', 'ME',
  'MK', 'RS', 'XK', 'MD', 'UA', 'BY', 'FO', 'GI', 'IM', 'JE', 'GG', 'AX'
]

// US EPA AQI (0-500) is the default everywhere except Europe; US family is
// covered by that default but kept explicit for clarity.
export const resolveAqiStandard = (code?: string): AqiStandard =>
  code && europeanCountries.includes(code) ? 'eaqi' : 'epa'

// ---- US EPA AQI ----------------------------------------------------------
// Piecewise-linear sub-index per pollutant; the AQI is the max across them.
// PM2.5/PM10 are used in their native ug/m3; the gases (O3, NO2, SO2, CO) are
// converted from ug/m3 to ppb/ppm so they can be folded in too — otherwise a
// high-ozone, low-particulate day would read "Good" while the official AQI is
// "Unhealthy". [Clow, Chigh, Ilow, Ihigh] in each pollutant's prepared unit.
type Breakpoint = [number, number, number, number]

// ug/m3 -> ppb at the EPA reference conditions (25 C, 1 atm; molar volume
// 24.45 L/mol). ppm = ppb / 1000.
const ugm3ToPpb = (ugm3: number, molecularWeight: number): number => (ugm3 * 24.45) / molecularWeight
const trunc = (c: number, decimals: number): number => {
  const f = 10 ** decimals
  return Math.floor(c * f) / f
}

interface EpaPollutant {
  // Convert raw ug/m3 to the unit and rounding the EPA table expects (EPA
  // truncates before lookup, which also snaps the value into a band).
  prepare: (ugm3: number) => number
  bp: Breakpoint[]
}

const EPA_POLLUTANTS: Record<string, EpaPollutant> = {
  // PM2.5 (24h, ug/m3, truncate 0.1)
  pm2_5: {
    prepare: (c) => trunc(c, 1),
    bp: [
      [0.0, 9.0, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
      [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]
    ]
  },
  // PM10 (24h, ug/m3, truncate 1)
  pm10: {
    prepare: (c) => Math.floor(c),
    bp: [
      [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
      [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500]
    ]
  },
  // O3 (8h, ppb, truncate 1). Above ~200 ppb the EPA switches to a 1h table;
  // we cap there, which only matters at extreme, rarely-reported ozone.
  o3: {
    prepare: (c) => Math.floor(ugm3ToPpb(c, 48.0)),
    bp: [
      [0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150],
      [86, 105, 151, 200], [106, 200, 201, 300]
    ]
  },
  // NO2 (1h, ppb, truncate 1)
  no2: {
    prepare: (c) => Math.floor(ugm3ToPpb(c, 46.0055)),
    bp: [
      [0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150], [361, 649, 151, 200],
      [650, 1249, 201, 300], [1250, 1649, 301, 400], [1650, 2049, 401, 500]
    ]
  },
  // SO2 (1h, ppb, truncate 1)
  so2: {
    prepare: (c) => Math.floor(ugm3ToPpb(c, 64.066)),
    bp: [
      [0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150], [186, 304, 151, 200],
      [305, 604, 201, 300], [605, 804, 301, 400], [805, 1004, 401, 500]
    ]
  },
  // CO (8h, ppm, truncate 0.1)
  co: {
    prepare: (c) => trunc(ugm3ToPpb(c, 28.01) / 1000, 1),
    bp: [
      [0.0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150], [12.5, 15.4, 151, 200],
      [15.5, 30.4, 201, 300], [30.5, 40.4, 301, 400], [40.5, 50.4, 401, 500]
    ]
  }
}

const epaSubIndex = (prepared: number, bp: Breakpoint[]): number => {
  for (const [clow, chigh, ilow, ihigh] of bp) {
    if (prepared <= chigh) {
      return Math.round(((ihigh - ilow) / (chigh - clow)) * (prepared - clow) + ilow)
    }
  }
  // Above the top breakpoint: cap at the maximum AQI.
  return 500
}

const epaCategory = (aqi: number): { label: string; severity: number } => {
  if (aqi <= 50) return { label: 'Good', severity: 1 }
  if (aqi <= 100) return { label: 'Moderate', severity: 2 }
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', severity: 3 }
  if (aqi <= 200) return { label: 'Unhealthy', severity: 4 }
  if (aqi <= 300) return { label: 'Very Unhealthy', severity: 5 }
  return { label: 'Hazardous', severity: 6 }
}

const computeEpaAqi = (components: Components): AqiResult | null => {
  let worst: { key: string; idx: number } | null = null
  for (const [key, pollutant] of Object.entries(EPA_POLLUTANTS)) {
    const raw = components[key]
    if (!(typeof raw === 'number' && raw >= 0)) continue
    const idx = epaSubIndex(pollutant.prepare(raw), pollutant.bp)
    if (!worst || idx > worst.idx) worst = { key, idx }
  }
  if (!worst) return null

  const { label, severity } = epaCategory(worst.idx)
  return {
    standard: 'epa',
    standardLabel: 'Air Quality Index',
    value: worst.idx,
    severity,
    label,
    dominant: POLLUTANT_NAMES[worst.key],
    advice: AQI_ADVICE[severity - 1]
  }
}

// ---- European Air Quality Index (EAQI) -----------------------------------
// Band 1-6 per pollutant by upper-bound concentration; the index is the worst
// band across PM2.5, PM10, NO2, O3 and SO2.
const EAQI_BREAKPOINTS: Record<string, number[]> = {
  pm2_5: [5, 15, 50, 90, 140],
  pm10: [15, 45, 120, 195, 270],
  no2: [10, 25, 60, 100, 150],
  o3: [60, 100, 120, 160, 180],
  so2: [20, 40, 125, 190, 275]
}

const EAQI_LABELS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor', 'Extremely Poor']

const eaqiBand = (pollutant: string, concentration: number | undefined): number | null => {
  if (!(typeof concentration === 'number' && concentration >= 0)) return null
  const bounds = EAQI_BREAKPOINTS[pollutant]
  for (let i = 0; i < bounds.length; i++) {
    if (concentration <= bounds[i]) return i + 1
  }
  return 6
}

const computeEaqi = (components: Components): AqiResult | null => {
  const bands = Object.keys(EAQI_BREAKPOINTS)
    .map((key) => ({ key, band: eaqiBand(key, components[key]) }))
    .filter((b): b is { key: string; band: number } => b.band !== null)
  if (bands.length === 0) return null

  const worst = bands.reduce((a, b) => (b.band > a.band ? b : a))
  return {
    standard: 'eaqi',
    standardLabel: 'Air Quality Index',
    value: worst.band,
    severity: worst.band,
    label: EAQI_LABELS[worst.band - 1],
    dominant: POLLUTANT_NAMES[worst.key],
    advice: AQI_ADVICE[worst.band - 1]
  }
}

// Compute the index for a set of pollutant concentrations under the given
// standard ('epa' | 'eaqi'). Returns null when no usable pollutant is present.
export const computeAqi = (components: Components | null | undefined, standard: AqiStandard): AqiResult | null => {
  if (!components) return null
  return standard === 'eaqi' ? computeEaqi(components) : computeEpaAqi(components)
}

// Last-resort reading from OpenWeatherMap's own 1-5 index (main.aqi), used only
// when no raw component is usable so the sign shows a category rather than going
// blank. OWM: 1 Good, 2 Fair, 3 Moderate, 4 Poor, 5 Very Poor.
const OWM_LABELS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor']
export const owmFallback = (owmAqi: number | undefined): AqiResult | null => {
  if (!(typeof owmAqi === 'number' && owmAqi >= 1 && owmAqi <= 5)) return null
  return {
    standard: 'eaqi',
    standardLabel: 'Air Quality Index',
    value: owmAqi,
    severity: owmAqi,
    label: OWM_LABELS[owmAqi - 1],
    dominant: '',
    advice: AQI_ADVICE[owmAqi - 1]
  }
}
