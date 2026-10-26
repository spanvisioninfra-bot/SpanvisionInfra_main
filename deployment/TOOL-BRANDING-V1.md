# Tool logos and v1.0 product labels

All 16 tool headers now use the matching icon from the main site's tool catalog. The catalog and headers show the shared product label **v1.0**, configured in `branding/release.json`. Icon paths are shared through `branding/tool-icons.json`.

The screenshot follow-up also applies the CAD2D icon and v1.0 badge to its welcome page, and removes the Field information popup and its toolbar button. To publish just this follow-up, deploy `cad2d` and `field` to Vercel; Render needs no further change.

| Tool | Product release |
| --- | --- |
| 3D CAD | v1.0 |
| 2D Vision Studio | v1.0 |
| Vision BIM Validator | v1.0 |
| Vision PDF Workspace | v1.0 |
| Vision IFC Studio | v1.0 |
| Calc Vision Studio | v1.0 |
| Open Vision Studio | v1.0 |
| FEM Vision Studio | v1.0 |
| Frame Vision Studio | v1.0 |
| Vision Calculation Studio | v1.0 |
| Vision Geotech Studio | v1.0 |
| Speech Vision Studio | v1.0 |
| Vision STL -3D Studio | v1.0 |
| Vision Field Studio | v1.0 |
| Vision Pointcloud Studio | v1.0 |
| Vision Pile Studio | v1.0 |

This is the SaaS product's visible release label. Internal engine/package versions and the existing Pile Alpha notice remain intact. No Git release tags, installer releases or updater migrations are created.

## Review and push manually

The push command explicitly targets your personal repository, regardless of what `origin` currently points to. Review the staged list before committing; posts, reels, private `.env` files and generated QA output are not included.

```powershell
Set-Location -LiteralPath 'C:\Users\dell\Documents\ChatGPT\own CAD'
git add -- Dockerfile render.yaml branding/common.mjs branding/release.json branding/tool-icons.json deployment/browser-ui.mjs deployment/browser-ui/tool-identity.js deployment/browser-ui/workspace-ui.css deployment/refresh-tool-branding.mjs deployment/tool-branding.test.mjs deployment/verify-tool-branding.mjs deployment/TOOL-BRANDING-V1.md suite-hub/src/ToolIcon.jsx suite-hub/src/main.jsx suite-hub/src/preview.css
git add -u -- branding/setup-field.mjs qa/field/verify.mjs spanvision-field-workspace
git diff --cached --name-status
git diff --cached --check
git diff --cached --ignore-space-at-eol
git commit -m "Match tool headers to catalog icons and show v1.0"
git push https://github.com/rashi-gupta-08/SpanvisionInfra_main.git HEAD:version/V.1.0
```

## Publish to Vercel

The main website has been rebuilt and the existing tool builds have had their presentation assets refreshed. Editor engines do not need to be recompiled for this branding-only update. If you change application code, rebuild its application first.

The following uses the existing CLI and temporary/cache directories on D: to avoid the low disk space on C:. It publishes the main site and all 14 static tool frontends to their existing linked Vercel projects. You are already signed in.

```powershell
Set-Location -LiteralPath 'C:\Users\dell\Documents\ChatGPT\own CAD'
$cliRoot = 'D:\SpanvisionToolchain\generated-deployment-output-2026-10-10\.vercel-cli'
$vercelEntry = "$cliRoot\npm-cache\_npx\46dba4b4f8747427\node_modules\vercel\dist\vc.js"
$vercelConfig = "$cliRoot\config"
$env:TEMP = "$cliRoot\temp"
$env:TMP = $env:TEMP
$env:NODE_OPTIONS = '--max-old-space-size=512 --max-semi-space-size=4 --v8-pool-size=1'
$env:VERCEL_TELEMETRY_DISABLED = '1'
if (!(Test-Path -LiteralPath $vercelEntry)) { throw 'The cached Vercel CLI is missing.' }

node deployment/refresh-tool-branding.mjs
if ($LASTEXITCODE -ne 0) { throw 'Branding refresh failed.' }

$tools = @('hub','cad','cad2d','pdf','ifc','calc','planner','fem','frame','calculation','geo','speech','field','pointcloud','pile')
foreach ($tool in $tools) {
  node deployment/package-vercel.mjs $tool
  if ($LASTEXITCODE -ne 0) { throw "Packaging failed: $tool" }
  node "$vercelEntry" deploy --prebuilt --prod --yes --scope spanvisioninfra-bot --global-config "$vercelConfig" --cwd "qa/deployment/output/$tool"
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $tool" }
}
```

If you change the landing page again, run `node branding/build.mjs hub` with the existing D: temporary-directory settings before packaging it.

## Publish BIM and STL on Render

For each service, ensure the connected repository's `version/V.1.0` branch contains this reviewed change. Pushing only to your personal fork will not update a service connected to the company repository; transfer the change through your normal Git workflow first, or deliberately reconnect the service.

Select **Manual Deploy → Deploy latest commit** for **spanvision-bim** and **spanvision-stl**. The Docker build now copies the shared release and icon catalog, and Render's build filters include those files. The FEM calculation backend does not need a branding deployment.

After deployment, hard-refresh the pages with **Ctrl + Shift + R**. Logos should match their catalog cards and the product release badge should read **v1.0**.

## Local verification

Verified: 34 light/dark browser cases (the main site plus 16 tools), three native header actions, two narrow-screen header layouts, and three installer regression tests. The landing-page build also passed. These checks cover branding and header behavior; they do not certify backend availability or every engineering feature.

```powershell
node --test deployment/tool-branding.test.mjs
node deployment/verify-tool-branding.mjs
```

The browser check reads the existing generated tool builds and writes screenshots and results under the ignored `qa/deployment/output/tool-branding-2026-10-21` directory. Set `TEMP` and `TMP` to its `temp` subdirectory on this computer before running checks.
