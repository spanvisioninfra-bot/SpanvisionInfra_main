# Clean tool workspace URLs

All 16 tool editors use `/workspace`. The suite opens its launcher at
`/launch/<tool-id>` (for example, `/launch/cad`). Existing `launch.html?tool=...`
links remain accepted and normalize to the new path.

Speech has separate paths for `/transcribe`, `/settings`, `/dictionary`,
`/models`, `/mic-test`, `/meeting`, `/tts`, `/suggestions` and `/account`.
Old Speech hash links are normalized; Back/Forward does not reload the editor.
2D CAD uses `/` for its start screen and `/workspace` for the editor.

Only the technical `appearance` and `launch` parameters are removed at startup.
Actual project/query parameters and non-navigation fragments remain intact.
The requested theme is passed in the existing signed-ticket form handoff and
stored separately as a validated appearance preference. It grants no access.
Tool authorization still uses the private HttpOnly tool-session cookie.

## Packaging

- `package-vercel.mjs` installs the shared early startup script in each tool.
- CAD `/workspace` rewrites to its existing `/app/index.html`; a fixed HTML base
  keeps its JS, WASM, fonts and worker paths intact. No Rust rebuild is required.
- The hub rewrites `/launch/<tool-id>` to its existing launcher HTML.
- Other Vercel tools retain their SPA fallback for direct links and refresh.
- BIM's existing SPA fallback serves `/workspace`. STL explicitly registers
  `/workspace` and `/workspace/` with the original page handler.
- The Render Docker build uses the same shared frontend installer.
- Desktop/Tauri URLs remain owned by their native applications.

Deploy the updated main site and all 14 Vercel tool projects, plus BIM and STL
on Render. These changes require more than a main-site-only deployment.
The FEM engine service has no frontend routing change; deploy its shared access
guard when rolling out the updated backend services.

## Checks

```powershell
node --test deployment/workspace-routes.test.mjs deployment/module-url.test.mjs deployment/tool-access.test.mjs deployment/tool-branding.test.mjs
node deployment/verify-workspace-routes.mjs
node deployment/verify-tool-trial-browser.mjs
node deployment/verify-hub-routing.mjs
```

Use the existing Python environment to run
`python -m unittest deployment.test_tool_access deployment.test_workspace_routes`.
The focused STL test loads the real page handler and decorators without requiring
geometry drivers. A complete STL cloud-processing test still requires a working
`pyproj` installation in the local geometry environment.

Browser checks use local packaged assets and controlled access responses. They
do not log in to real accounts, charge payments, invoke AI providers or consume
production trial launches. Results are saved under the ignored deployment output.
