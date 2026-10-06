# Verification evidence and limits

## Repeatable commands

The maintained runner is `deployment/audit-suite.mjs`. It uses the actual application test suites, keeps workspace cache mutations sequential and records each result with command, directory, timestamps and exit status. Use its check IDs to rerun a changed area; the full runner includes native and browser gates and can take substantial time.

Examples:

```text
node deployment/audit-suite.mjs bim-backend-tests bim-viewer-tests
node deployment/audit-suite.mjs calc-tests pdf-tests
node deployment/audit-suite.mjs planner-verify
node deployment/audit-suite.mjs frame-core-tests frame-browser-edits
node deployment/audit-suite.mjs fem-v2-tests fem-v2-types fem-native-core-tests fem-sidecar-tests
node deployment/audit-suite.mjs pointcloud-parser-tests pointcloud-types
```

Run `node deployment/verify-cad2d-browser.mjs` against the 2D CAD preview (default port 4220, override `CAD2D_TEST_URL`). It draws through mouse input, executes SQL against the drawing, checks error recovery, downloads/reopens the project and verifies draft and theme persistence. It also checks editor spacing after the CSS framework migration.

Run `node deployment/verify-pointcloud-roundtrip.mjs` against the Pointcloud preview (default port 4250, override `POINTCLOUD_TEST_URL`). It imports actual LAS/LAZ files, reads independently decoded source coordinates, inspects downloaded PLY data and reimports it. Malformed-file recovery uses the real parsing worker.

Run `node deployment/verify-geo-pdf.mjs` against the Geotechnical preview (default port 4235, override `GEO_TEST_URL`). It creates a two-page reference PDF, selects and resizes a crop through mouse input, independently decodes the resulting PNG and checks both themes, cancellation and malformed-file recovery.

Run `node qa/readiness/ifc-browser.mjs` against the built IFC preview (default port 3005, override `IFC_TEST_URL`). It uses the actual web-ifc WASM reader, observes rendered geometry changes and inspects a downloaded CSV. It covers filtering/playback, document switching, failed second imports, theme persistence and four viewport widths. The current fixture is an IFC2X3 model with six elements; it does not establish large-model or native installer coverage.

The full IFC package gate is `pnpm check` in `ifc-view`. Planner requires `npm run verify`; on Windows, include the Windows System32 and Git Bash directories in PATH. The root audit runner supplies those paths. `OPS_BROWSER_CHANNEL=msedge` explicitly selects installed Edge for local browser tests; CI uses the pinned Playwright Chromium installation. Temporary browser data can be placed on a drive with sufficient capacity using TEMP/TMP.

Planner's browser test server explicitly configures the existing fixture repository and update controls. The release/statistics tests intercept those HTTP responses; this checks UI behavior with configured services, not live provider access or a production updater. Production service endpoints remain an owner configuration. Vite readiness waits for entry transforms and dependency optimization. Backup dependency junctions and generated Playwright evidence are excluded from watching, preserving source hot reload without scanning obsolete installs. Do not increase test timeouts or change numeric/oracle baselines to obtain a pass.

Pointcloud native core checks compile the shipped Rust modules without substituting an engine or launching Tauri:

```text
cargo test --manifest-path spanvision-pointcloud-workspace/core-tests/Cargo.toml --locked --jobs 1
cargo check --manifest-path spanvision-pointcloud-workspace/src-tauri/Cargo.toml --locked --jobs 1
cargo test --manifest-path spanvision-pile-plane-workspace/Cargo.toml --workspace --locked --jobs 1
```

Use a configured Rust target/cache directory when disk space is constrained. Pile's native HiGHS build additionally needs CMake, the C++ toolchain and libclang, as described in its deployment guide. Native library checks are separate from Tauri compilation and Windows GUI acceptance.

The maintained audit runner includes `pointcloud-native-tests`, `pointcloud-desktop-check` and `pile-native-tests`. It inherits toolchain/cache environment variables and runs serially by default; set `SPANVISION_AUDIT_JOBS` to 2–4 only when the host has sufficient memory. Concurrent tests can exhaust Windows commit memory even with available physical RAM.

Pointcloud parsing references the [Stanford PLY format resources](https://graphics.stanford.edu/data/3Dscanrep/) and [ASPRS LAS 1.4 R15](https://www.asprs.org/wp-content/uploads/2019/07/LAS_1_4_r15.pdf). These checks cover the implemented coordinate/color/classification records, not all LAS metadata, waveform records or coordinate-system VLR interpretation.

For browser OCR and local profiles, serve the built hub on the test URL and run:

```text
node deployment/verify-ocr.mjs
node deployment/verify-local-profile.mjs
```

The default test origin is `http://127.0.0.1:4299`. Override `OCR_TEST_URL` or `HUB_TEST_URL` when using another local origin. Tests use headless Edge through Playwright. OCR tests generate a real image and multipage scanned PDF, run recognition and extract text from the downloaded PDF; they do not substitute a simulated recognition result. They also cancel an operation, reject a malformed PDF and a 26-page all-pages selection, and recognize a valid image after those failures. This establishes recovery, not immediate worker termination or universal recognition accuracy.

PDF Studio's representative browser document check uses its built preview (default port 3084, override `PDF_TEST_URL`):

```text
node deployment/verify-pdf-documents.mjs
python deployment/verify_pdf_documents.py
```

The browser check opens a real two-page PDF, draws a rectangle through mouse input, checks both themes, downloads via Save As and reopens the saved annotation. It also cancels a file selection, rejects malformed PDFs, restores a non-adjacent active tab and retries after a failed first import. The independent Python check uses pypdf and pdfplumber to verify page text, 90-degree rotation, annotation geometry and appearance, and character bounds. Generated files and results are in `qa/readiness/pdf-documents`. When Poppler is available on PATH, Python renders both pages for review. Visual review is a separate recorded step. This fixture does not establish all PDF annotation, font, accessibility or print workflows.

Run `node deployment/verify-field-recovery.mjs` against the built Field preview (default port 4245, override `FIELD_TEST_URL`). It uses the actual file input, verifies malformed JSON and invalid collection types without changing the active project, then retries and reloads with embedded media. The broader `node qa/field/verify.mjs` also covers reports, signatures, JSON/BCF exports, actual IFC geometry, themes and responsive controls. Set `FIELD_QA_OUT` to a fresh evidence directory to retain previous output; the latest broader run is in `qa/readiness/field-browser/results.json`. External connector responses in that broader check are explicit fixtures.

`deployment/test_upload_limits.py` sends actual ASGI chunks, including dishonest and missing Content-Length headers. `deployment/test_cloud.py` uses real HTTP APIs with independent anonymous clients. Run one service per process with `SPANVISION_SERVICE=bim` or `stl` and that application's Python environment.

`deployment/verify-web.mjs` and `qa/deployment/verify-api.py` are deployed-environment checks. A successful page load/theme test proves neither a working solver nor every control. API tests inspect actual processing and tenant ownership.

Serve the built Speech app on port 4298 and run `node deployment/verify-speech.mjs` (or set `SPEECH_TEST_URL`). This recognizes a real English WAV recording with the downloaded Whisper model, rejects an invalid recording and verifies the editable transcript and exported text. Results are recorded in `qa/readiness/speech-browser.json`.

## Interpretation

- A TypeScript check establishes static compatibility, not runtime feature completeness.
- Regression assertions and reference cases establish the specific behaviors and numeric cases tested. They do not certify every engineering scenario.
- Skipped tests remain unverified. Read their reasons in the source/logs before claiming coverage.
- Existing baseline/oracle pins are not regenerated to hide failures. Windows line-ending and deterministic gzip-header repairs preserve the original reference content and numeric results.
- FEM v2 source and bundle checks cover the canonical calculation implementation. The canonical frontend and Rust bridge were deployed on 6 October 2026; live section/API recovery and browser theme checks passed. These checks do not establish every engineering case or Windows acceptance.
- Windows Rust tests establish native library behavior. Windows installer and GUI acceptance is a separate outstanding gate.
- Source test results precede deployment. Retest the actual deployed build and record its source commit before publishing a release status.

## Required acceptance coverage

Frame's current file and geometry checks use the actual Rust/WASM build. Rebuild with `npm run build:wasm` in `frame-vision-studio/ui`, then `node branding/build.mjs frame` from the suite root. With its built preview on port 4294 and 2D CAD on port 4220, run:

```text
node deployment/audit-suite.mjs frame-core-tests frame-desktop-check frame-browser-edits
node deployment/verify-frame-files.mjs
python deployment/verify_frame_archives.py
npm ci --ignore-scripts --prefix deployment/validation-tools
node deployment/verify-frame-ifc.mjs
python deployment/verify_frame_ifc_geometry.py
node deployment/verify-frame-cad-exchange.mjs
node deployment/verify-cad2d-browser.mjs
```

Use the Python environment with IfcOpenShell for independent IFC validation. `FRAME_TEST_URL` and `CAD2D_TEST_URL` override preview origins. The optional pinned Khronos validator is a verification dependency only. Browser tests download actual files; Python checks production ZIP/CSV and IFC schema/solid geometry independently. Generated evidence lives in `qa/readiness/frame-*.json`, screenshots and downloaded files. These tests do not perform native GUI or installer acceptance.

Run `node deployment/verify-calc-pdf.mjs` against the Calc preview specified by `CALC_TEST_URL` (default port 4297). This uses an actual two-page PDF and checks rendering, measurement units, zoom stability, page navigation and invalid-file rejection.

Run `node deployment/audit-suite.mjs fem-api-tests` after building `toetsbrug` and `doorsnedemotor` in the FEM release target. The HTTP tests execute the actual Rust binaries, including independent rectangle area/inertia references, invalid dimensions and subsequent service recovery. These checks do not establish national-code compliance.

For each shipped edition, create or import a representative project, edit it, undo/redo where supported, save, reload/reopen, export and inspect the exported content. Cover an invalid file, a cancelled operation, a permission failure, recovery after reload/restart, dark/light canvas visibility and browser resizing. Long-running operations must show real progress or an indeterminate state, support cancellation where offered, and display an error when they fail.

The coverage matrix in [production-readiness.md](production-readiness.md) remains the release checklist. Features marked incomplete or unverified must be completed and tested before the suite is described as production ready.

Frame's document regression fixtures exercise the actual native PDF and Excel generators:

```text
cargo run --manifest-path frame-vision-studio/Cargo.toml --locked -p ofs-core --example export_documents --jobs 1 -- qa/readiness/frame-documents
python deployment/verify_frame_documents.py
node deployment/verify-frame-documents.mjs
python deployment/verify_frame_documents.py qa/readiness/frame-documents --browser
```

Use the Python environment containing pypdf, pdfplumber and openpyxl, with Poppler's `pdftoppm` on PATH. The native generator covers 78 frames, 90 cutting rows, 70 terms, actual label IDs, Unicode, populated panel/hardware/bead sections and fractional dimensions. Python checks actual content, totals and character bounds and renders every PDF page. Browser checks use the actual file picker and seven download buttons, then inspect quotation drafts, status changes and invalid/valid revisions. The `--browser` pass independently validates the downloaded documents. Record visual review separately; text extraction alone does not establish a usable page layout.
