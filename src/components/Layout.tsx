import { html } from 'hono/html'
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

const gaScript = (id?: string) =>
  id
    ? html`
      <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
      <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());

        gtag('config', '${id}');
      </script>`
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
      <!-- Degraded mode for older/weaker signage players. Runs before the
           stylesheet so html.legacy is set on the first paint: flags the device
           as legacy when the browser engine is old (missing a 2020-era feature)
           or the hardware looks weak, then the stylesheet drops all animation. -->
      <script>
        (function () {
          try {
            var slow =
              (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
              (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)
            var old =
              !('replaceChildren' in Element.prototype) ||
              !(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in oklab, red, blue)'))
            if (slow || old) document.documentElement.className += ' legacy'
          } catch (e) {
            document.documentElement.className += ' legacy'
          }
        })()
      </script>
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
