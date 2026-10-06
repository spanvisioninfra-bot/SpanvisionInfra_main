# Spanvision Infra

**Spanvision Infra · SI · Spanvision Mono**

A shared entry point for all 16 CAD, BIM, document, calculation, planning, structural, geotechnical and field tools.

English is the only interface language in this edition. Language menus offer English, browser language detection is disabled, and legacy Dutch preferences open in English. Calc reports and the PDF OCR language picker also default to English. Imported document text, technical identifiers and company names retain their original content.

## Build and preview

Clone the complete source repository with `git clone https://github.com/spanvisioninfra-bot/SpanvisionInfra_main.git`, then enter `SpanvisionInfra_main`. This repository contains the main preview, all 16 tools, their frontend and backend source, native desktop shells, shared branding, dependency lockfiles and verification scripts. Embedded upstream repositories and the local Pile Plan junction are included as ordinary source directories; no submodule initialization or original ZIP downloads are required.

Use Node.js 22 or newer and Python 3.12. Install Rust stable, the `wasm32-unknown-unknown` target, `wasm-pack` and `trunk` for the CAD and Pile Plan browser engines. On Windows, CAD currently builds in the `kali-linux` WSL distribution with those Rust tools installed inside WSL; Pile Plan builds with the Windows Rust toolchain. Native Tauri builds additionally need the platform's Tauri prerequisites, C/C++ build tools and each module's documented native libraries.

```powershell
npm ci
npm run setup:suite
npm run brand:sync
npm run brand:icons
npm run brand:check
npm run build:suite
npm run preview:suite
```

Open [SpanvisionInfra](http://127.0.0.1:4230/). Tool links open independent editors in new tabs. Preview servers bind to the local machine. Unbuilt, outdated or conflicting modules appear as unavailable instead of serving a previous edition. An already-running server is reused only if its build stamp matches the current source.

The CAD browser build uses the available `kali-linux` WSL Rust/Trunk toolchain on this Windows host, with `/tmp/spanvision-target` as its build cache. On Linux it uses the local Rust/Trunk toolchain. Other modules use their local Vite installations; the PDF browser build bypasses native runtime preparation. These browser builds do not produce Windows installers.

Build selected modules with `node branding/build.mjs speech hub`, `node branding/build.mjs cad2d pdf ifc calc hub` or `node branding/build.mjs cad`. Restart the preview command after rebuilding an unavailable module. Speech Workspace runs independently at port 4240 and uses its own SW mark; the suite retains GW. Run `npm run verify:speech` for speech screens, sample import, account previews, migration and theme persistence.

## Shared identity and presentation

`branding/brand.json` controls the organization, suite name, GW mark, module registry, default theme and palette. `brand:sync` produces local manifests, CSS adapters, Rust/Iced palette constants and vector marks. Local adapters travel with each app so its standalone builds do not require the suite directory. `brand:icons` produces the native raster and platform icons. `brand:check` detects adapter drift.

Spanvision Mono uses a black background, #121212 panels, #1B1B1B workspaces, #202020 raised controls, white/light-gray primary text, #999999 supporting labels and translucent white borders/focus states. The [Agenciy live preview](https://agenciy.framer.website/) is the requested visual reference. Natural-color photography and drawing/model/document colors stay independent of the UI palette. Existing theme and canvas preferences win over new-profile defaults.

Application identifiers, executable paths, REST/IPC operations, plugin interfaces, tool names and storage namespaces remain compatible. Software presentation and newly generated export metadata use the new identity. Original user documents, customer logos and settings are not renamed.

Geotechniek uses the new native package identity `com.spanvisioninfra.geotechniek` and copies missing preferences from the legacy profile on first launch. Existing files, IPC commands, REST routes and MCP tool names remain compatible. Its browser preview is available at port 4235. Build the Windows executable and NSIS installer with `npm run build:geo:windows`; see `spanvision-geptechniek-workspace/ARCHITECTURE.md` for its report, migration and vendored backend architecture.

## Preview screens

Four additional studios are imported from the supplied Spanvision source archives and listed in the main overview and Tools:

| Studio | Local preview | Browser workspace |
| --- | --- | --- |
| Open Vision Studio | http://127.0.0.1:4265/ | Construction planning, tasks, resources and IFC schedules |
| FEM Vision Studio | http://127.0.0.1:4270/ | Finite element models, loads, structural analysis and results |
| Frame Vision Studio | http://127.0.0.1:4275/ | Frame design, profiles, 3D views and production plans |
| Vision Calculation Studio | http://127.0.0.1:4280/ | Visual calculation designers, calculation documents and reports |

Install dependencies with `npm ci --prefix open-vision-studio`, `npm ci --prefix fem-vision-studio`, `npm ci --prefix frame-vision-studio/ui` and `npm ci --prefix vision-calculation-studio`. Run `node branding/sync.mjs --modules=planner,fem,frame,calculation`, then `node branding/build.mjs planner fem frame calculation hub` and `npm run preview:suite`. Verify their launcher links and browser workflows with `npm run verify:studios`. The studio source notices are linked from the hub footer.

Frame uses the browser WebAssembly engine included in its source archive. FEM retains its local browser solver. Optional native design checks, filesystem integrations, configured AI services and other desktop-only functions keep the limitations documented in the respective studios; adding the launchers does not provide a desktop runtime.

Vision BIM Validator is imported from `Vision-BIM-Validator-Spanvision.zip`. The main overview has direct 2D CAD and BIM shortcuts; both also appear in Tools. BIM opens at [127.0.0.1:4260/home](http://127.0.0.1:4260/home), with its model workspace at `/viewer` and real IFC/IDS validation at `/validate`. The suite starts its FastAPI backend and serves the built frontend on the same port.

For a fresh BIM installation, create `vision-bim-validator/.venv` with Python 3.12, install `vision-bim-validator/server/requirements.txt` and the editable `vision-bim-validator` package in that environment, then run `npm ci --prefix vision-bim-validator/viewer`. Run `node branding/sync.mjs --modules=bim`, `node branding/build.mjs bim hub`, and `npm run preview:suite`. `npm run preview:bim` starts the validator independently; `SPANVISION_BIM_PYTHON` can select another prepared Python environment. Run `npm run verify:bim` against the running suite. Source attribution remains in the imported notices and is linked from the hub footer.

2D CAD opens at [127.0.0.1:4220](http://127.0.0.1:4220/). Choose **New drawing** to draft in the browser or **Open file** to import an existing drawing. Build it with `node branding/build.mjs cad2d` if needed.

Field Workspace uses the FW mark and opens directly into its local inspection interface at [127.0.0.1:4245](http://127.0.0.1:4245/). Build it with `node branding/build.mjs field hub`, preview independently with `npm run preview:field`, and run `npm run verify:field`. `npm run build:field:windows` produces the unsigned Windows x64 application and NSIS installer in `delivery/field/windows`. See [Field architecture](spanvision-field-workspace/ARCHITECTURE.md) and [Field verification](qa/field/VERIFICATION.md).

STL-3D map workspace opens at [127.0.0.1:8765](http://127.0.0.1:8765/) and retains its Python/FastAPI geometry backend and Leaflet map interface. It covers the Netherlands. Build it with `node branding/build.mjs stl hub`, preview independently with `npm run preview:stl`, and run its browser checks with `npm run verify:stl`. The isolated Python environment is selected through `SPANVISION_STL_PYTHON` or the module's `.venv`.

Run `npm run build:stl:windows` for its portable ZIP and Inno Setup installer. The standalone application includes its own branding, offline interface assets and open-source notices. See [STL architecture](spanvision-stl-3d-map-workspace/ARCHITECTURE.md) and [verification report](qa/stl/VERIFICATION.md) for storage migration, compatibility and delivery details.

The hub provides overview, tool launcher, scan demonstration, login, sign-up and account screens. Account and scan demonstrations are labeled previews. No credentials are transmitted or saved, and profile changes exist only in memory for the current session. Real OCR capabilities remain in the corresponding editors.

## Verification and attribution

The main preview and all 16 tools have a **Color mode** selector with **Light** and **Dark**. The choice is saved in the browser. Tool links inherit the mode selected on the main preview, and each tool also has its own quick switch. Existing drawing, model and result colors are preserved. Run `npm run brand:appearance` to synchronize the shared control assets, then rebuild the suite. Run `npm run verify:appearance` against the preview to check both modes and saved preferences.

Run `node qa/english/browser-audit.mjs` against the preview to check every tool with a Dutch browser locale and saved Dutch preferences. It verifies English document language, language options and uncaught browser errors.

Run `npm run verify:suite` against the running suite preview. It exercises responsive layouts at 320, 390, 820 and 1440 pixels, dialogs, keyboard focus, account validation, module availability and upstream-brand leakage. Fresh captures and results are in `qa/suite/`; see [verification](qa/suite/VERIFICATION.md).

Each application retains its original license, copyright records and technical compatibility names. Attribution is also available from the hub footer. Archived upstream documents are provenance copies, outside the active suite. The repository's root MIT license applies to original suite integration code; it does not replace the individual applications' licenses or their dependencies' licenses, including LGPL, GPL, Apache and Creative Commons notices retained in their directories.

## Complete source layout

| Tool | Source directory | Engines and backends included |
| --- | --- | --- |
| Main preview | `suite-hub` | SolidJS launcher; Node preview orchestration in `branding` |
| CAD | `SpanvisionCAD` | Rust desktop application and browser WebAssembly entry |
| 2D CAD | `spanvision-2d-cad-workspace` | Browser drawing engine and desktop shell |
| BIM Validator | `vision-bim-validator` | Viewer frontend, Python validator package, FastAPI server |
| PDF | `spanvision-pdf-workspace` | Frontend, Rust rendering/CAD/PDFium workers, Tauri and MCP sources |
| IFC | `ifc-view` | Desktop frontend, IFC parser and viewer packages, Rust/Tauri shell |
| Calc | `calc-workspace` | Estimation frontend, native shell and vendored reporting sources |
| Open Vision Studio | `open-vision-studio` | Planning frontend, scheduling engine, Rust/Tauri shell |
| FEM Vision Studio | `fem-vision-studio` | FEM frontend, browser solver and native shell |
| Frame Vision Studio | `frame-vision-studio` | Frontend, Rust core, WASM engine and desktop shell |
| Calculation Studio | `vision-calculation-studio` | Shared calculation core, web frontend and native desktop package |
| Geotechnical | `spanvision-geptechniek-workspace` | Frontend, Rust backend and vendored CPT/reporting crates |
| Speech | `spanvision-speech-workspace` | Frontend, Rust recording/transcription commands and local engine adapters |
| STL-3D Map | `spanvision-stl-3d-map-workspace` | Map frontend, Python/FastAPI geometry backend and packaging scripts |
| Field | `spanvision-field-workspace` | Inspection frontend, Rust/Tauri shell and reporting integrations |
| Pointcloud | `spanvision-pointcloud-workspace` | Frontend, Rust/Tauri backend and point-cloud processing sources |
| Pile Plan | `spanvision-pile-plane-workspace` | React frontend, Rust engineering core, WASM wrapper and native shell |

`npm run setup:suite` installs each frontend from its own lockfile (IFC uses its pinned pnpm version), creates the BIM and STL Python environments, and installs their backend packages. Set `SPANVISION_SETUP_PYTHON` to a Python 3.12 executable if the default `python` command selects another version. Inspect the commands with `npm run setup:suite -- --plan`, or select modules with `--modules=bim,stl,hub`. Browser builds and native installers are separate outputs; the full backend source is included even where a browser preview offers only a sample workflow.

Dependency caches, local settings, credentials, downloaded model weights, external native runtime binaries, installers, duplicate original imports and customer PDF test documents are excluded from source control. PDF's `prepare:native-runtime` and `prepare:ocr-runtime` scripts restore its external runtimes for native builds. Speech native packaging additionally requires a compatible Whisper CLI runtime and the configured Whisper model resources; its architecture describes that boundary, and `qa/speech/engine-dependencies.mjs` audits a supplied Windows runtime's DLL dependencies. These assets are not required by the browser preview. Build generated outputs locally instead of committing them.

Pointcloud Workspace uses the PW mark and opens at http://127.0.0.1:4250/. Build it with `node branding/build.mjs pointcloud hub`, preview it with `npm run preview:pointcloud`, and verify it with `npm run verify:pointcloud`. See `spanvision-pointcloud-workspace/ARCHITECTURE.md`.

## Cloud deployment

Updated 6 October 2026: the hub and 15 tools are deployed from `version/V.1.0`, commit `36aa5c04`. Canonical FEM v2 now uses its real Rust API on Render. Planner's updated deployment remains pending its full verification gate. See [deployment record](docs/deployment-2026-10-06.md) for live checks and remaining limits. A root [Planner verification workflow](.github/workflows/planner-verify.yml) is prepared for a hosted full gate and awaits manual commit/push.

The main screen and 14 static browser tools run as independent Vercel projects so each editor retains its own asset paths and browser drafts. BIM Validator and STL-3D Map run on Render with their Python APIs and frontends on the same origin. `render.yaml` explicitly selects free services in Singapore; the shared Dockerfile chooses its dependency set using `SPANVISION_SERVICE=bim` or `stl`.

Build the browser tools with `npm run build:suite`, sign in using the official Vercel and Render CLIs, then set `VERCEL_CLI_ENTRY` to the installed Vercel CLI's `dist/vc.js`. Run `node deployment/deploy-vercel.mjs cad cad2d pdf ifc calc planner fem frame calculation geo speech field pointcloud pile`. It publishes complete prebuilt outputs and records verified URLs under ignored `qa/deployment/`. Deploy the three services from `render.yaml`, record their verified URLs with the static URLs in `deployment/production.json`, rebuild the hub with `node branding/build.mjs hub`, and run `node deployment/deploy-vercel.mjs hub`. `deployment/collect-manifest.mjs` can assemble and check this manifest using Vercel's saved report and Render service-creation JSON saved as `qa/deployment/render-bim-create.log` and `render-stl-create.log`. The hub package refuses missing or insecure tool URLs. Static projects use explicit uploads rather than an incompatible root monorepo Git build.

Render workspaces are isolated by secure browser-session cookies. Cloud uploads are limited to 50 MB, and generated STL files are downloaded in the browser. These free preview services use temporary storage, so download results before leaving and expect data to reset after a restart. Desktop file dialogs, local Whisper/OCR engines and Tauri-only commands still require the corresponding desktop applications. The browser sample features remain labeled as previews.

Verify production URL resolution with `node --test deployment/module-url.test.mjs`. Run `python -m deployment.test_cloud` with `SPANVISION_SERVICE=bim` in the BIM environment and `SPANVISION_SERVICE=stl` in the STL environment to check project, upload and validation-job isolation, trusted-header handling and cloud export behavior.

The deployed main screen is at https://spanvision-infra.vercel.app/. Run `node deployment/verify-web.mjs` to verify public frontend assets, English, the default dark mode, theme switching and saved preferences across all deployed tools. Production URLs are recorded in `deployment/production.json`.
