# Publish the tool launcher and map fixes

These changes are local until you publish them:

- All tool launchers: navigate to the verified workspace address after checking availability, without blocking on a separate backend health endpoint. Retry and invalid-address protection remain. A sleeping Render service can still take time to serve its own page.
- Geotechnical: location controls sit below the small map. Resizing preserves the map centre, and location detection, CPT markers and map controls remain available.
- STL: the stacked location controls and area instructions were already committed in `fdd8248f`. A live asset check found that Render was still serving the older, overlapping layout. That service must deploy the branch containing the fix.
- FEM's English IFC warning fix is already in `fdd8248f`; it does not need another build for the new launcher/map changes.

## Review, commit and push manually

Run in PowerShell from the repository. Confirm that `origin` is your repository, `rashi-gupta-08/SpanvisionInfra_main`.

```powershell
Set-Location -LiteralPath 'C:\Users\dell\Documents\ChatGPT\own CAD'
git remote -v
git diff --ignore-space-at-eol --stat
git diff --ignore-space-at-eol

git add -- branding/map-location.js branding/map-location.ts branding/check-map-location-browser.mjs suite-hub/src/launch.js spanvision-geptechniek-workspace/apps/desktop/public/appearance.js spanvision-geptechniek-workspace/apps/desktop/src/suiteMapLocation.ts spanvision-geptechniek-workspace/apps/desktop/src/App.css spanvision-geptechniek-workspace/apps/desktop/src/components/panels/LocationMiniMap.tsx deployment/verify-tool-launch.mjs deployment/THREE-PAGE-FIXES.md
git diff --cached --stat
git diff --cached --ignore-space-at-eol
git commit -m "Fix tool launch gating and Geotechnical map controls"
git push origin HEAD:version/V.1.0
```

The named files exclude private `.env` files, promotional media and generated QA output. The existing mini-map component has mixed line endings in Git; Git may display normalization along with its code changes. Use `--ignore-space-at-eol` when reviewing the functional diff.

## Publish the main site and Geotechnical on Vercel

The current builds have been prepared locally. If you change their source again, rebuild with `node branding/build.mjs geo hub` before packaging. Build the tools sequentially and keep temporary files off the nearly full C: drive.

Use the Vercel CLI already cached on D: directly, with a 512 MB Node heap. This avoids running npm alongside the CLI on a computer with limited available memory. Both new packages passed the deployment dry run with these settings. You have already signed in; there is no need to repeat login.

```powershell
$cliRoot = 'D:\SpanvisionToolchain\generated-deployment-output-2026-10-10\.vercel-cli'
$env:npm_config_cache = Join-Path $cliRoot 'npm-cache'
$env:TEMP = Join-Path $cliRoot 'temp'
$env:TMP = $env:TEMP
$env:NODE_OPTIONS = '--max-old-space-size=512 --max-semi-space-size=4 --v8-pool-size=1'
$env:VERCEL_TELEMETRY_DISABLED = '1'
$vercelConfig = Join-Path $cliRoot 'config'
$vercelEntry = "$cliRoot\npm-cache\_npx\46dba4b4f8747427\node_modules\vercel\dist\vc.js"
if (!(Test-Path -LiteralPath $vercelEntry)) { throw 'The cached Vercel CLI is missing.' }

foreach ($tool in @('hub', 'geo')) {
  node deployment/package-vercel.mjs $tool
  if ($LASTEXITCODE -ne 0) { throw "Packaging failed: $tool" }
  node "$vercelEntry" deploy --prebuilt --prod --yes --scope spanvisioninfra-bot --global-config "$vercelConfig" --cwd "qa/deployment/output/$tool"
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $tool" }
}
```

## Publish STL on Render

1. Open the `spanvision-stl` service in Render.
2. Check **Settings → Build & Deploy** for its connected repository and branch.
3. Ensure the reviewed commit exists in that connected branch, including the STL fix from `fdd8248f`. Pushing to your personal fork does not update a service connected to `spanvisioninfra-bot/SpanvisionInfra_main`. Transfer the reviewed changes through your normal Git workflow, or explicitly choose to reconnect the service to your fork.
4. Select **Manual Deploy → Deploy latest commit** and wait for the service to become live.

The BIM backend does not need a code change for the launcher fix; publishing the main site updates its launcher. If the direct BIM workspace remains unavailable, inspect that Render service's logs.

After publishing, launch STL, BIM and FEM from the main site's tool list. Check that Geotechnical's location controls are below its map and STL's controls do not overlap its area instructions. A sleeping Render service can take longer to open.
