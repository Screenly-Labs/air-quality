import { html, raw } from 'hono/html'
import { analyticsBootstrap } from '@screenly-labs/signage-kit/analytics-bootstrap'
import { PLAYER_PROFILE_PATH } from '@screenly-labs/signage-kit/analytics-server'
import { GATE } from '@screenly-labs/signage-kit/gate'
import type { Child } from 'hono/jsx'

interface LayoutProps {
  sentryId?: string
  gaId?: string
  v: string
  children?: Child
}

// Sentry / Google Analytics are optional: constants.ts ships empty IDs for this
// app, and these helpers render nothing when an ID is absent, so no broken
// script tags go out. Populate sentryIds/gaIds (per env) to enable them.
const sentryScript = (id?: string) =>
  id
    ? html`<script src="https://js.sentry-cdn.com/${id}.min.js" crossorigin="anonymous"></script>`
    : ''

// The bootstrap comes from the kit so `client_id` is pinned to the Screenly device id, making
// one screen one GA4 user. GA4's own client_id lives in the _ga cookie, and these players
// largely boot with fresh storage, so it churns and does not identify a screen. The kit fetches
// the no-store profile route and configures with the derived id, falling back to GA4's default
// on any failure or timeout, so a screen never goes silent.
const gaScript = (id?: string) =>
  id
    ? html`
      <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
      ${raw(analyticsBootstrap({ gaId: id, profilePath: PLAYER_PROFILE_PATH }))}`
    : ''

const Layout = (props: LayoutProps) => html`<!DOCTYPE html>
  <html lang="en">
    <head>
      <title>Screenly Air Quality App - Air Quality Index</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link
        rel="preload"
        href="/static/fonts/fraunces-latin-standard-normal.woff2?v=${props.v}"
        as="font"
        type="font/woff2"
        crossorigin
      />
      <link
        rel="preload"
        href="/static/fonts/hanken-grotesk-latin-wght-normal.woff2?v=${props.v}"
        as="font"
        type="font/woff2"
        crossorigin
      />
      <!-- Shared degraded-mode gate from @screenly-labs/signage-kit, before the
           stylesheet so html.legacy is set on the first paint. -->
      ${raw(GATE)}
      <link rel="stylesheet" href="/static/styles/main.css?v=${props.v}" />
      ${sentryScript(props.sentryId)}
      ${gaScript(props.gaId)}
      <!-- main.js is the bundled, self-executing classic script (no ES module
           export), so a plain async <script> runs it and any cached HTML stays
           compatible across deploys. The ?v= busts it whenever the bundle
           changes. It is built from main.ts/locale.ts by build.ts. -->
      <script src="/static/js/main.js?v=${props.v}" async defer></script>
    </head>
    <body>
      ${props.children}
    </body>
  </html>`

export default Layout
