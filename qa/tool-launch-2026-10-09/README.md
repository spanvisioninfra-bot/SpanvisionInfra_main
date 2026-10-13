# Tool launch verification — 9 October 2026

The main website opens a branded splash and then the selected workspace. BIM and STL readiness checks keep the splash visible while Render starts the service. Errors expose Retry and Back to tools.

## Published frontend changes

The hub, CAD, 2D CAD and Planner were published to their existing production Vercel projects on 9 October. The remaining frontend projects did not require source changes for this launch flow. Exact deployment IDs are recorded in `../deployment/vercel-deployments.json`.

- `live-results.json`: 23 successful checks, covering actual launches for all 16 tools, additional light-mode launches, mobile 2D CAD, default dark mode and live readiness endpoints. This verifies launch behavior, not every feature of every tool.
- `local-results.json`: 22 local checks, including routing fixtures and actual 2D CAD draft restoration, mobile, denied storage and manual start.
- `readiness-results.json`: three controlled readiness checks covering retries, timeout recovery and omitted credentials.
- `planner-verify.log`: the complete required Planner verification passed, including 333 browser tests.
- `cad-shell-results.json`: actual compiled CAD workspace launches in both themes, standalone Start behavior and repeated launches preserving the drawing.
- `render-status.json`: all three Render services report live deployments in Singapore, last deployed 6 October at commit `36aa5c04`.

CAD's full engine rebuild could not complete within this machine's resources. Only its browser loader changed; `assemble-cad-shell.mjs` checks that engine source has not changed and verifies the retained JavaScript and WASM against production hashes. `cad-shell-build.json` records those hashes and the assembly method. The deployed CAD opens Drawing1 directly; its Rust engine was not rebuilt.

During the final check, BIM and STL initially returned temporary readiness errors while starting. The splash retry behavior waited successfully; both endpoints subsequently returned valid JSON and the full live check passed.

## Repository status

At verification, the local and remote `version/V.1.0` branch remained at `e028cd45798816647fccceb36ef5a07a6c50099f`; upstream main remained at `33005a74`. Recent website and launch changes are uncommitted and unpushed. Vercel publishes these frontend builds directly, independently of Git. No commit, push, merge or Render redeployment was performed for this update.
