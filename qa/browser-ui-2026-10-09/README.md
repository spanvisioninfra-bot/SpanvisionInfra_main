# Browser UI refresh — 9 October 2026

The main site and all 16 browser tools share locally served Inter UI text and Space Grotesk headings. The neutral dark/light palette remains in place. Editor title bars, tabs, controls and dialogs receive restrained styling; the main site's catalogue has rounded, bordered cards.

`deployment/browser-ui.mjs` installs the versioned stylesheet and licensed font assets after a build and during Vercel packaging. Render's Docker frontend stage applies the same assets to BIM and STL. Re-running the installer replaces its own HTML block without duplicating links. Hub splash HTML is optional for compatibility with older builds.

Drawing/model canvas fonts and print styling are excluded. CAD's native ribbon is rendered by its existing WASM engine, so only its browser controls and loading screen receive the new typography. Planner's native high-contrast title bar and hover styling are preserved. Operating-system forced colors and reduced motion are respected.

## Verification

- `node qa/browser-ui-2026-10-09/preview-check.mjs` checks the proposed stylesheet on the real main site and 16 tool pages in both themes, records browser errors, confirms fonts load, checks that visible canvases remain visible, and checks the main site's mobile width. It writes screenshots and `preview-results.json` for visual review.
- `node qa/browser-ui-2026-10-09/verify-live.mjs vercel` checks the published main site and 14 Vercel tools.
- `node qa/browser-ui-2026-10-09/verify-live.mjs render` checks the published BIM and STL tools.

The live checks verify the exact stylesheet hash, locally served fonts, visible theme-selector interactions and browser errors. Both commands merge results into `live-results.json` and capture screenshots. These are UI release checks, not certification of every engineering calculation or tool feature.

Run the browser checks with Chrome installed and Windows System32 in `PATH` so Playwright can close its browser processes. Generated reports and screenshots are review artifacts rather than source files.
