# English interface and visitor map location

The English language pass covers the main site and the 16 tool entries. It includes
dialogs, import/export diagnostics, report headings, worksheet explanations and
default labels that previously bypassed the English translation resources.
Existing project content, names, file-format fields, API values and engineering
variables remain compatible with saved files. Original language dictionaries
are retained in source where needed; the SaaS startup policy is English.

## What the maps do

- New geographic maps open near the visitor's approximate area using the main
  site's `/__suite/location` endpoint. Country names are displayed in English.
- A precise browser location is used automatically only when permission was
  already granted. **Use my location** requests permission when clicked.
- Saved project extents and manual map movements take priority over a late
  automatic location result.
- When location information is unavailable, the map starts with a world view
  and allows manual navigation. It does not assume the Netherlands.
- The location endpoint uses Vercel request metadata, returns no IP address,
  and does not store a location history. It needs no database or new API key.
  The geographic tools may save their normal project map viewport.

The worldwide base map does **not** expand regional datasets. 3D BAG, PDOK,
Dutch aerial imagery and Dutch ground investigation services retain their
actual coverage. Their Netherlands coverage notices are intentional. Address
suggestions from PDOK are regional; coordinates and manual map navigation work
outside that region. Engineering national annexes are not changed by location.

References: [Vercel request headers](https://vercel.com/docs/headers/request-headers)
and [Vercel Build Output functions](https://vercel.com/docs/build-output-api/primitives).

## Review and local checks

Run from the repository folder in PowerShell:

```powershell
git status --short
git diff --stat
git diff -- branding/map-location.js deployment/package-vercel.mjs
node branding/check-english.mjs
node branding/check-worksheet-equations.mjs
node --test deployment/visitor-location.test.mjs
node branding/audit-ui-english.mjs
```

The source audit is a review aid: inactive Dutch fallback resources, protocol
identifiers and company names can appear in its results. It is not a proof that
every possible feature state has been exercised.

The browser audit visits public pages, tabs and available settings dialogs. It
does not upload projects or change production accounts. Protected admin pages,
user-authored content and every possible imported document require separate
acceptance testing. Audit output stays in the ignored `qa/deployment/output`
directory.

```powershell
# Public deployment audit:
node branding/audit-live-english.mjs
# Built local pages, with account/database services disabled:
node branding/audit-live-english.mjs --local hub cad2d bim pdf calc planner fem frame calculation geo pointcloud stl
node branding/check-map-location-browser.mjs
```

## Verification completed locally

- English startup resources: all 16 tools, 12,234 resource strings checked.
- Final browser audit: 12 affected applications, 83 screen/tab views, no detected
  Dutch interface text and no page errors. Eighteen raw IFC data rows retain
  their original file-format property names and are classified as document data.
- All 12 affected application builds passed. The final Planner and FEM build
  fingerprints match their source.
- Location checks: five automated tests and nine real-map browser cases across
  India, the United States and the United Kingdom passed without an unsolicited
  GPS permission request.
- All 86 worksheet template strings retain their executable equations and
  selection values. FEM timber, reports, IFC and stability regressions passed.
- Planner's full planning suite and five timezone runs passed, as did its library
  suite, all 58 MCP test files, type checks, lint, dev-server tests, four targeted
  browser tests and nine static consistency gates. These checks were completed
  in separate runs; the complete browser suite was not run.

The public-site baseline covered the hub and all 16 tool entries. Its three
detected Dutch warnings are corrected in the local FEM build. The live site
still needs publication to receive these changes. This is scoped acceptance
coverage, not a claim that every authenticated or imported-document state was
tested.

## Build the changed applications

Use sequential builds if memory is limited. The commands assume dependencies
are already installed. The STL Python override is local to this computer.

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1536 --max-semi-space-size=16 --v8-pool-size=1'
$env:GOMAXPROCS='1'
$env:RAYON_NUM_THREADS='1'
$env:SPANVISION_STL_PYTHON=(Resolve-Path 'vision-bim-validator/.venv/Scripts/python.exe').Path
node branding/build.mjs cad2d bim pdf calc planner fem frame calculation geo pointcloud stl hub
if ($LASTEXITCODE -ne 0) { throw 'Resolve the build errors before deploying.' }
```

Planner's complete check is `npm.cmd run verify` inside `open-vision-studio`.
It requires Git Bash on PATH; on this computer the installation is `D:\Git\bin`.
`OPS_TZ_JOBS=1` limits its timezone tests to one process at a time and
`OPS_BROWSER_CHANNEL=msedge` uses the installed Edge browser.

## Manual Git commands

Nothing in this change is committed, pushed or deployed automatically.
Review the diff first. The following stages tracked changes in the affected
tools and names the new maintenance files explicitly. It excludes QA output,
the unrelated `output/` folder, images and real `.env` files.

```powershell
git add -u -- calc-workspace fem-vision-studio frame-vision-studio open-vision-studio spanvision-2d-cad-workspace spanvision-geptechniek-workspace spanvision-pdf-workspace spanvision-pointcloud-workspace spanvision-stl-3d-map-workspace vision-bim-validator vision-calculation-studio
git add -- branding/map-location.js branding/audit-ui-english.mjs branding/audit-live-english.mjs branding/audit-preview-server.mjs branding/check-map-location-browser.mjs branding/check-worksheet-equations.mjs branding/worksheet-display.mjs deployment/package-vercel.mjs deployment/visitor-location.mjs deployment/visitor-location.test.mjs deployment/LANGUAGE-AND-LOCATION.md
git diff --cached --stat
git diff --cached
git commit -m "Translate remaining tool interfaces and use visitor map locations"
git push origin HEAD:version/V.1.0
```

Check `git remote -v` before pushing. The intended `origin` is
`rashi-gupta-08/SpanvisionInfra_main`. Do not include `commerce/NEON-SETUP.md`
or any real `.env` file.

## Manual publication

Deploy the **main site first**, so the map tools can call the new location
endpoint. `npx.cmd` avoids the PowerShell execution-policy error from `npx.ps1`.
The existing local package is linked to the `spanvision-infra` Vercel project.

```powershell
node deployment/package-vercel.mjs hub
if ($LASTEXITCODE -ne 0) { throw 'Hub packaging failed.' }
npx.cmd vercel login
npx.cmd vercel deploy --prebuilt --prod --scope spanvisioninfra-bot --cwd qa/deployment/output/hub
```

Then publish the affected static tools to their existing linked projects:

```powershell
$englishTools=@('cad2d','pdf','calc','planner','fem','frame','calculation','geo','pointcloud')
foreach ($englishTool in $englishTools) {
  node deployment/package-vercel.mjs $englishTool
  if ($LASTEXITCODE -ne 0) { throw "Packaging failed: $englishTool" }
  npx.cmd vercel deploy --prebuilt --prod --scope spanvisioninfra-bot --cwd "qa/deployment/output/$englishTool"
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $englishTool" }
}
```

Verify the project name in each tool's `.vercel/project.json` before uploading.
The unchanged tools do not need a rebuild for this patch.

BIM and STL run on Render. Their connected repository and branch must contain
the reviewed changes before **Manual Deploy → Deploy latest commit**. Publishing
only to the personal fork does not update services still connected to
`spanvisioninfra-bot/SpanvisionInfra_main`. Keep Render's source unchanged unless
you explicitly choose to change it; transfer the reviewed commit to its
connected source through your normal Git workflow.

After publication, open the main site's location endpoint and the three map
tools. Test a new map, a saved project, manual panning, and location permission
denial. Approximate locations can reflect VPN or ISP routing rather than the
visitor's precise position.
