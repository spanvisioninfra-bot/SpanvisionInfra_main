# Deployment record — 6 October 2026

Source: `version/V.1.0`, commit `36aa5c04e5cd6470095365ae72b86c903dbd6e11`.

The updated hub is live at https://spanvision-infra.vercel.app/. Vercel publishes complete prebuilt browser outputs; Git pushes alone do not rebuild these independent projects. Published tools: CAD, 2D CAD, PDF, IFC, Calc, FEM, Frame, Vision Calculation, Geotechnical, Speech, Field, Pointcloud and Pile Plane. Planner remains on its previous deployment while its required full `npm run verify` gate completes.

Render BIM and STL services were switched to `version/V.1.0` and deployed from the exact source commit. The new FEM service uses the same branch and commit with `deployment/Dockerfile.fem`. All three use the free plan and Singapore region. Health checks returned HTTP 200.

Planner verification: the 06:57–07:16 UTC full gate passed type checking, lint, 560 scheduling cases and all five timezone runs, but returned planning exit 1. Later suites did not execute. The diagnostic rerun then passed planning, library, MCP and development-server suites and reached browser test 212 of 332 before a Windows-recorded Codex crash at 13:25 IST interrupted the process. No browser failure had been reported before the interruption. A fresh full gate runs in a hidden background process with durable logs. It reported dependency-index performance at 754 ms against the unchanged 500 ms limit; an isolated rerun passed all 27 checks at 364 ms. The complete release gate remains pending; this variability is not waived by the isolated pass.

Verification completed:

- Deployed entry HTML and referenced JavaScript/CSS match the current local builds for the hub and 15 updated tools.
- Updated pages load in English, preserve selected themes and expose both light and dark mode without uncaught browser errors or broken JS/CSS/WASM assets.
- BIM processes real IFC geometry, completes IDS validation and isolates synthetic project/file/job access between anonymous clients.
- STL performs live geocoding, map loading, design parsing, model generation and private downloads.
- FEM runs actual Linux Rust engines; independent rectangle area/inertia, invalid-input rejection, size limits and recovery pass directly and through Vercel. Canonical geometry and both themes pass in the browser.
- PDF passes seven real document checks: open, annotate, export, reopen, cancellation, malformed-file recovery and retry. Field passes six project recovery checks. 2D CAD passes six drawing/query/persistence checks.

Provider deployment IDs and verification records are retained locally under `qa/deployment/release-2026-10-06/` and `qa/deployment/vercel-deployments.json`. Browser and document evidence also resides under `qa/readiness/`. Earlier failed verification attempts remain recorded; resource failures are not passing gates.

This deployment does not certify the entire suite as production ready. Windows GUI/installers, outstanding workflows and engineering-standard reviews remain governed by [production readiness](production-readiness.md). Render project storage remains temporary and services can sleep.

No Git commit or push was performed during this deployment. Verification-harness changes and refreshed evidence remain local for the user's manual commit workflow.

## Hosted verification awaiting manual push

The original Planner workflow is nested inside the tool directory; GitHub discovers workflows only at the combined repository's root. `.github/workflows/planner-verify.yml` now runs the unchanged complete `npm run verify` on Ubuntu with Node 22 and Playwright, followed by a gated browser build. It retains logs and browser failure evidence and has read-only repository permissions. YAML validation passes locally; no hosted workflow has run yet. The user's requested manual commit/push is needed to activate it. A successful hosted result must be tied to its exact source commit before the Planner deployment is updated.
