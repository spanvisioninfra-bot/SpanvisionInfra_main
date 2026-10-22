# Light-mode visibility fixes — 22 October 2026

Updated the main website and tool presentation styles locally. Nothing has been committed, pushed or deployed by this change.

## Changes

- Improved muted text, form labels, placeholders, active buttons and status labels on light surfaces.
- Repaired the website's local-profile cards, pricing-region label, OCR dialog and links.
- Added readable light-mode IFC syntax and entity-label colours while retaining category distinctions.
- Repaired Frame summary badges, Field actions, Geo report empty states and Pile plan selection labels.
- Connected the CAD2D phone viewer's theme to the website preference. Its navigation, touch hints and side panels now have readable light-mode text and icons.

The new stylesheet is scoped to light-mode screen UI. Drawing geometry, stored model colours, custom canvas backgrounds, print output and engine versions are unchanged.

## Verification

- 143 desktop view states across the main website and all 16 tools.
- 21 phone view states across the same 17 frontends, including CAD2D hints and panels.
- 17 account/admin view states using synthetic read-only account data.
- No text-contrast findings, browser exceptions or document-level overflow in those verified states.
- Native CAD2D theme cycling, automatic mode and website/phone synchronization passed.
- A sample CAD2D rectangle survived repeated theme switches unchanged. BIM, IFC and Pointcloud retained custom canvas-colour preferences.
- CAD2D TypeScript checking and browser build passed; three installer regression tests passed.

The contrast audit checks visible DOM text against resolvable backgrounds at 4.5:1 for normal text and 3:1 for large text. Canvas content and image/gradient backgrounds also need visual inspection; this is not a claim that every engineering operation or backend workflow was retested. Screenshots and the consolidated report are in the ignored `qa/deployment/output/light-mode-2026-10-21/` directory (`verified-summary.json`).

Run the desktop audit again:

```powershell
node deployment/audit-light-mode.mjs --phase=review --verify
```

On this computer set `TEMP` and `TMP` to a D: directory before browser checks or builds because C: has limited free space.

## Review and push manually

This selection contains source and verification files only. It excludes promotional media, private environment files and generated screenshots/builds. The explicit push URL targets your personal repository even if `origin` points to the company repository.

```powershell
Set-Location -LiteralPath 'C:\Users\dell\Documents\ChatGPT\own CAD'
git add -- deployment/browser-ui.mjs deployment/browser-ui/light-mode.css deployment/audit-light-mode.mjs deployment/tool-branding.test.mjs deployment/LIGHT-MODE-FIXES.md spanvision-2d-cad-workspace/src/components/tablet/TabletApp.tsx spanvision-2d-cad-workspace/src/components/tablet/TabletToolbar.tsx spanvision-2d-cad-workspace/src/components/tablet/ThemeToggle.tsx
git diff --cached --name-status
git diff --cached --check
git diff --cached --ignore-space-at-eol
git commit -m "Fix light-mode text contrast and synchronize CAD phone appearance"
git push https://github.com/rashi-gupta-08/SpanvisionInfra_main.git HEAD:version/V.1.0
```

## Vercel

The CAD2D application was rebuilt and the existing builds have the updated shared styles. The main website and all 14 static tools need publishing to apply the shared fixes everywhere. No other editor engine needs recompiling for this presentation update.

```powershell
Set-Location -LiteralPath 'C:\Users\dell\Documents\ChatGPT\own CAD'
$cliRoot = 'D:\SpanvisionToolchain\generated-deployment-output-2026-10-10\.vercel-cli'
$vercelEntry = "$cliRoot\npm-cache\_npx\46dba4b4f8747427\node_modules\vercel\dist\vc.js"
$vercelConfig = "$cliRoot\config"
$env:TEMP = "$cliRoot\temp"
$env:TMP = $env:TEMP
$env:NODE_OPTIONS = '--max-old-space-size=512 --max-semi-space-size=4 --v8-pool-size=1'
$env:VERCEL_TELEMETRY_DISABLED = '1'
if (!(Test-Path -LiteralPath $vercelEntry)) { throw 'Cached Vercel CLI is missing.' }

node deployment/refresh-tool-branding.mjs
if ($LASTEXITCODE -ne 0) { throw 'Presentation refresh failed.' }
foreach ($tool in @('hub','cad','cad2d','pdf','ifc','calc','planner','fem','frame','calculation','geo','speech','field','pointcloud','pile')) {
  node deployment/package-vercel.mjs $tool
  if ($LASTEXITCODE -ne 0) { throw "Packaging failed: $tool" }
  node "$vercelEntry" deploy --prebuilt --prod --yes --scope spanvisioninfra-bot --global-config "$vercelConfig" --cwd "qa/deployment/output/$tool"
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $tool" }
}
```

If login is required, run `node "$vercelEntry" login --global-config "$vercelConfig"` and repeat the deployment loop.

## Render

The BIM and STL services also include the shared stylesheet. Ensure the reviewed commit is present in each service's connected repository and branch, then choose **Manual Deploy → Deploy latest commit** for `spanvision-bim` and `spanvision-stl`. Pushing to your personal fork alone does not update a service connected to the company repository; transfer the reviewed change through your existing Git workflow first. The FEM calculation backend needs no deployment for these UI changes.

After publishing, hard-refresh with **Ctrl + Shift + R** and select **Light**.
