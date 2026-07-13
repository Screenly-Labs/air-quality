#!/usr/bin/env bun
// Builds the static assets. Unlike a JS project, the client source is
// TypeScript (assets/static/js/main.ts + locale.ts) and browsers can't run TS,
// so this step is what produces the *served* file:
//
//   assets/static/js/main.ts  --bundle+minify-->  assets/static/js/main.js
//
// main.ts is the only JS *entry*. It imports ./locale (the unit-tested pure
// helpers), and `external: []` tells Bun to inline that import, so the emitted
// main.js is a self-executing classic script with no `export` token — loadable
// by every cached HTML variant (plain <script> or type="module"). locale.ts is
// a dependency, not an entry, so it is never built/served on its own.
//
// The emitted main.js is a build artifact (gitignored). CSS is minified in
// place (it is authored and served at the same path); pass --client to skip the
// CSS step (used by `bun run dev`, which only needs the JS bundle, so the
// working-tree CSS stays unminified for editing).

import { Glob } from 'bun'
import { bundleJs, processCss } from '@screenly-labs/signage-kit/build'
import { run as syncFonts } from './sync-fonts'

const clientOnly = process.argv.includes('--client')

// The support floor, JS/CSS down-level recipe and the degraded-mode kill-switch
// all live in @screenly-labs/signage-kit now (shared across the signage apps).
// bundleJs lowers the client TS to the ES2017 floor; processCss down-levels +
// minifies the stylesheet and (includeDegraded) prepends the html.legacy
// kill-switch. See the degraded-mode notes in Layout.tsx / main.css.

// Vendor the Bun-managed webfonts into ./assets first.
await syncFonts()

// ---- Client JS bundle: main.ts -> main.js --------------------------------
// bundleJs bundles main.ts (inlining ./locale + the shared polyfills shim),
// lowers modern syntax (?., ??, spread) to the ES2017 floor so old engines can
// parse it, and emits an IIFE so the output stays a self-contained self-executing
// classic script loadable from a plain <script> (same guarantee as before).
try {
  await bundleJs('assets/static/js/main.ts', 'assets/static/js/main.js')
} catch (error) {
  console.error('✗ Failed to build assets/static/js/main.ts')
  console.error(error)
  process.exit(1)
}
console.log('✓ JS: assets/static/js/main.js (iife, es2017)')

// ---- CSS: down-level + minify in place (skipped for --client) ------------
// processCss down-levels the authored CSS to the shared floor (lowers
// color-mix(), rgb() slash, etc. and adds prefixes), minifies, and prepends the
// shared html.legacy kill-switch (includeDegraded), writing back in place.
// url(/static/...) refs are left untouched.
if (!clientOnly) {
  const cssEntries: string[] = []
  for await (const path of new Glob('assets/static/styles/*.css').scan('.')) {
    cssEntries.push(path)
  }

  for (const path of cssEntries) {
    try {
      const code = await processCss(await Bun.file(path).text(), {
        includeDegraded: true,
        filename: path
      })
      await Bun.write(path, code)
    } catch (error) {
      console.error(`✗ Failed to build ${path}`)
      console.error(error)
      process.exit(1)
    }
    console.log(`✓ CSS: ${path}`)
  }
}

console.log(`Build complete${clientOnly ? ' (client JS only)' : ''}.`)
