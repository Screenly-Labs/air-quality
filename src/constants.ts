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

// Analytics IDs per environment. This is a new app, so it ships without Sentry
// or Google Analytics wired up; fill these in (per env) to enable them. Empty
// values mean Layout renders no Sentry/GA script tags at all.
export const sentryIds: Record<DeployEnv, string> = {
  stage: '',
  production: ''
}

export const gaIds: Record<DeployEnv, string> = {
  stage: '',
  production: ''
}
