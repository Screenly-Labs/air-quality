import { describe, expect, it } from 'bun:test'

// Unit tests for the client-side locale + air-quality logic in
// assets/static/js/locale.ts. These pure helpers were extracted from main.ts
// into their own module so they can be imported directly here, while main.ts
// stays an export-free self-executing browser script (bundled with locale.ts
// inlined by build.ts).
import {
  resolveLocale,
  setLocale,
  formatTime,
  formatDate,
  getTimeByOffset,
  resolveAqiStandard,
  computeAqi,
  owmFallback
} from '../assets/static/js/locale'

// Saturday 2026-06-20 13:30:00 UTC, as the unix seconds main.ts works with.
const DT = Math.floor(Date.parse('2026-06-20T13:30:00Z') / 1000)

// formatTime(getTimeByOffset(...)) is independent of the machine timezone:
// getTimeByOffset and the default-timezone Intl formatter both read the same
// local components, so the two timezone dependencies cancel out.
const timeAt = (offsetHours: number) => formatTime(getTimeByOffset(offsetHours * 3600, DT))
const dateAt = (offsetHours: number) => formatDate(getTimeByOffset(offsetHours * 3600, DT))

describe('resolveLocale', () => {
  it('maps known country codes to their locale', () => {
    expect(resolveLocale('US')).toBe('en-US')
    expect(resolveLocale('FR')).toBe('fr-FR')
    expect(resolveLocale('JP')).toBe('ja-JP')
    expect(resolveLocale('PR')).toBe('es-PR')
  })

  it('falls back to en-GB for unknown / missing codes', () => {
    expect(resolveLocale('ZZ')).toBe('en-GB')
    expect(resolveLocale('')).toBe('en-GB')
    expect(resolveLocale(undefined)).toBe('en-GB')
  })
})

describe('time formatting', () => {
  it('uses a 12-hour clock with AM/PM for en-US', () => {
    setLocale('US')
    expect(timeAt(-4)).toMatch(/^9:30(\s| )?AM$/i)
  })

  it('uses a 24-hour clock for en-GB, fr-FR, de-DE', () => {
    setLocale('GB')
    expect(timeAt(1)).toBe('14:30')
    setLocale('FR')
    expect(timeAt(2)).toBe('15:30')
    setLocale('DE')
    expect(timeAt(2)).toBe('15:30')
  })

  it('renders the location wall-clock from the timezone offset', () => {
    setLocale('JP')
    expect(timeAt(9)).toBe('22:30')
  })

  it('zero-pads the hour for 24-hour locales (so the forecast strip aligns)', () => {
    // 13:30 UTC - 4h = 09:30, - 12h = 01:30: both single-digit hours.
    setLocale('GB')
    expect(timeAt(-4)).toBe('09:30')
    expect(timeAt(-12)).toBe('01:30')
  })

  it('does not zero-pad the hour for 12-hour locales', () => {
    setLocale('US')
    expect(timeAt(-4)).toMatch(/^9:30(\s| )?AM$/i)
  })
})

describe('date localization', () => {
  it('renders month names in the location language', () => {
    setLocale('US')
    expect(dateAt(-4)).toMatch(/Jun/)
    setLocale('FR')
    expect(dateAt(2)).toMatch(/juin/)
    setLocale('DE')
    expect(dateAt(2)).toMatch(/Juni/)
  })

  it('pins the Gregorian calendar even for ar-SA (not Hijri)', () => {
    setLocale('SA')
    const date = dateAt(3)
    expect(date).toMatch(/20|٢٠/)
    expect(date).not.toMatch(/محرم/) // محرم (Muharram)
  })
})

describe('resolveAqiStandard (geo-specific scale)', () => {
  it('uses the US EPA scale for the US and its territories', () => {
    for (const code of ['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']) {
      expect(resolveAqiStandard(code)).toBe('epa')
    }
  })

  it('uses the European EAQI scale for European countries', () => {
    for (const code of ['FR', 'DE', 'GB', 'ES', 'IT', 'PL', 'NO', 'CH']) {
      expect(resolveAqiStandard(code)).toBe('eaqi')
    }
  })

  it('defaults to the EPA scale elsewhere (and for unknown codes)', () => {
    for (const code of ['JP', 'CN', 'IN', 'BR', 'AU', 'ZZ', '', undefined]) {
      expect(resolveAqiStandard(code)).toBe('epa')
    }
  })
})

describe('computeAqi — US EPA scale', () => {
  it('returns 50 / Good at the top of the PM2.5 Good band', () => {
    const aqi = computeAqi({ pm2_5: 9.0, pm10: 0 }, 'epa')
    expect(aqi).toMatchObject({ value: 50, severity: 1, label: 'Good', dominant: 'fine particles' })
    expect(aqi?.standardLabel).toBe('Air Quality Index')
    // Plain-English guidance accompanies every reading.
    expect(aqi?.advice).toMatch(/good/i)
  })

  it('interpolates the PM2.5 sub-index (35.4 -> 100, Moderate)', () => {
    const aqi = computeAqi({ pm2_5: 35.4, pm10: 0 }, 'epa')
    expect(aqi).toMatchObject({ value: 100, severity: 2, label: 'Moderate', dominant: 'fine particles' })
  })

  it('takes the worst pollutant as the index and names it the dominant', () => {
    // PM2.5 9.0 -> 50, PM10 255 -> 151 (Unhealthy). PM10 wins.
    const aqi = computeAqi({ pm2_5: 9.0, pm10: 255 }, 'epa')
    expect(aqi).toMatchObject({ value: 151, severity: 4, label: 'Unhealthy', dominant: 'dust' })
  })

  it('caps above the top breakpoint at 500 / Hazardous', () => {
    const aqi = computeAqi({ pm2_5: 5000, pm10: 0 }, 'epa')
    expect(aqi).toMatchObject({ value: 500, severity: 6, label: 'Hazardous' })
  })

  it('folds in gases so a high-ozone, low-particulate day is not "Good"', () => {
    // 180 ug/m3 ozone ~ 91 ppb (8h) -> AQI 164 "Unhealthy"; PM2.5 of 5 alone
    // would read ~11 "Good". The gas must drive the index.
    const aqi = computeAqi({ pm2_5: 5, o3: 180 }, 'epa')
    expect(aqi).toMatchObject({ value: 164, severity: 4, label: 'Unhealthy', dominant: 'ozone' })
  })

  it('computes a gas sub-index for NO2', () => {
    const aqi = computeAqi({ no2: 300 }, 'epa')
    expect(aqi).toMatchObject({ severity: 3, dominant: 'nitrogen dioxide' })
    expect(aqi?.value).toBeGreaterThan(100)
  })
})

describe('owmFallback (last-resort reading)', () => {
  it('maps OpenWeatherMap 1-5 to a category so the sign is never blank', () => {
    expect(owmFallback(1)).toMatchObject({ value: 1, severity: 1, label: 'Good' })
    expect(owmFallback(3)).toMatchObject({ value: 3, severity: 3, label: 'Moderate' })
    expect(owmFallback(5)).toMatchObject({ value: 5, severity: 5, label: 'Very Poor' })
  })

  it('returns null for a missing / out-of-range index', () => {
    expect(owmFallback(undefined)).toBeNull()
    expect(owmFallback(0)).toBeNull()
    expect(owmFallback(6)).toBeNull()
  })
})

describe('computeAqi — European EAQI scale', () => {
  it('returns band 1 / Good for clean air', () => {
    const aqi = computeAqi({ pm2_5: 3, pm10: 10, no2: 5, o3: 40, so2: 10 }, 'eaqi')
    expect(aqi).toMatchObject({ value: 1, severity: 1, label: 'Good' })
    expect(aqi?.standardLabel).toBe('Air Quality Index')
  })

  it('takes the worst pollutant band', () => {
    // o3 110 -> band 3 (Moderate) is uniquely the worst here.
    const aqi = computeAqi({ pm2_5: 10, pm10: 20, no2: 5, o3: 110, so2: 10 }, 'eaqi')
    expect(aqi).toMatchObject({ value: 3, label: 'Moderate', dominant: 'ozone' })
  })

  it('reaches band 6 / Extremely Poor for a very high pollutant', () => {
    const aqi = computeAqi({ no2: 200 }, 'eaqi')
    expect(aqi).toMatchObject({ value: 6, severity: 6, label: 'Extremely Poor', dominant: 'nitrogen dioxide' })
  })
})

describe('computeAqi — edge cases', () => {
  it('returns null when there is nothing to compute', () => {
    expect(computeAqi(null, 'epa')).toBeNull()
    expect(computeAqi({}, 'epa')).toBeNull()
    expect(computeAqi({}, 'eaqi')).toBeNull()
  })
})
