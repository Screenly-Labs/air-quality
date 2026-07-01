export const locationHeaders = {
  lat: 'x-screenly-lat',
  lng: 'x-screenly-lng'
} as const

export const locationQueryParams = {
  lat: 'lat',
  lng: 'lng'
} as const

// Defaults to San Fransisco
export const defaultLocation = {
  lat: '37.77',
  lng: '-122.43'
} as const

type DeployEnv = 'stage' | 'production'

// Analytics IDs per environment. Sentry is not wired up yet; fill these in (per
// env) to enable it. Empty values mean Layout renders no Sentry/GA script tags
// at all. GA4 is live on production only; stage stays empty so test/preview
// traffic is not counted.
export const sentryIds: Record<DeployEnv, string> = {
  stage: '',
  production: ''
}

export const gaIds: Record<DeployEnv, string> = {
  stage: '',
  production: 'G-30B61M6PLF'
}
