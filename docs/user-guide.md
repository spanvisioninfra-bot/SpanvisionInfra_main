# Spanvision Infra user guide

This guide covers the suite's verified workflows and the current differences between browser and Windows editions. See [production-readiness.md](production-readiness.md) before relying on a feature for production work.

## Start a workspace

Open the main hub, choose **Tools**, then open the editor you need. Tools open in their own tabs. No organization sign-in is required. The hub's **Local profile** saves a display name in that browser; it does not provide cloud storage or synchronize projects between tools or devices.

Dark appearance is the initial default. Choose Light or Dark from the appearance control. Each tool keeps its preference on its own origin. Browser drafts and profiles can be lost if you clear site data, use a private session, or change devices. Save project files and keep backups outside the browser.

## Scan and OCR

In the hub, choose **Explore scan & OCR** and select a scanned PDF or image. Choose all pages or the first page, then **Recognize text**. The first use downloads the English OCR model. Recognition runs on your device; the document is not sent to a processing server.

Files are limited to 50 MB, 25 processed pages and 20 megapixels per rendered image. A first-page operation retains the original PDF pages but adds recognized text only to the first page. Split larger documents in PDF Studio first.

Review the recognized text, then download the searchable PDF or text file. OCR can misread dimensions, punctuation, identifiers and poor scans. Check those values against the original document before using them in a project or calculation. Cancel closes the operation; reopening and recognizing another scan has been verified. Malformed PDFs and an all-pages selection exceeding 25 pages display an error; select the first page or split the source before retrying.

## Drawings and models

- **CAD / 2D CAD:** Create or open a drawing, edit geometry, and save a project file before closing. 2D CAD's browser edition opens supported DXF drawings and its own project files. DWG conversion needs the native runtime; an unsupported browser DWG import displays an error and preserves the active drawing. Test representative drawings because format coverage differs between editions.
- **IFC:** Open a building model, inspect its elements and use the sequence parameter to explore construction order.
- **Vision BIM Validator:** Add an IFC model, inspect properties, choose an IDS specification or bundled standard, and run validation. Validation is asynchronous; wait for the completed job before exporting findings. The validation API supports `.ifc` and a ZIP containing one `.ifc` model. IFC XML is rejected by the current engine.
- **Frame Vision Studio:** This tool designs windows, doors and curtain walls. Browser Save downloads an `.ofs` project; Open reads that file. Save also commits the current named profile draft. New/Open and profile replacement offer Save, Discard and Cancel for unsaved edits. Browser estimates, production plans and cutting plans use the Rust engine. Production → CSV downloads one ZIP containing cut, glass, hardware, gasket and material lists. IFC imports read window/door dimensions; detailed IFC/GLB exports cover supported rectangular modeled members. Generic CNC downloads are explicitly unverified previews; tenon toolpaths are incomplete. Machine-specific output will require the selected machine and controller details.
- **Pointcloud:** Text imports include XYZ, PTS and PTX. PTX registration transforms scans into a shared coordinate system. LAS/LAZ and PLY import/export checks preserve survey coordinates. PLY supports ASCII and either binary byte order; triangle topology and classification fields are retained. Triangulate polygon meshes before import. Browser clouds display/export up to one million sampled points; browser triangle meshes are limited to one million vertices and three million triangles. Keep original survey files. Native LAS/LAZ export writes every source point in the current engine's supported range of 1–50 million points. Translate and scale use source survey X/Y/Z axes. Native editing/reconstruction prepares complete sources up to one million points and 128 MB; split larger sources first. Thinning applies to point clouds; it rejects triangle meshes. PLY, XYZ, PTS and CSV exports restore source axes and geographic offsets. Native edit/reconstruction and file-dialog acceptance remain under verification.
- **Pile Plane / Geotechnical / STL 3D Map:** Select the project location and source data, then inspect the result before exporting. Location permission only centers the map; it does not guarantee that a provider has data for that location. Some providers cover the Netherlands only.

## Documents, planning and calculations

Frame's browser document controls now download real files. Under **IFC / Export**, use **Schedule PDF**, **Schedule Excel**, or **Drawing PDF** for the selected frame. Under **Production**, use **PDF**, **Excel**, or **Labels PDF**. Under **Quotations**, **Export PDF** downloads the current project reference estimate. Empty schedules display an error. Workshop and production documents support rectangular grid frames without extensions; the workshop drawing is a dimensioned front-view schematic, not a complete fabrication-detail package. Embedded PDF fonts cover Latin, Greek and Cyrillic; unsupported characters display an error.

**+ New quotation** calculates a draft from the current project reference rates, discount, installation, transport and tax. Change its status or create a revision, then save the project to keep those records. Enter a finite, nonnegative revision amount. **Export PDF** reports current project values and does not export a manually revised total from the quotation history. Rates and reports use EUR; confirm supplier rates, local tax and company details before commercial issue.

- **PDF:** Open the source document, annotate or measure it, then use Save As to save a copy and inspect the resulting pages. Browser rectangle annotations and page rotation survive download and reopen in the verified two-page workflow. Set drawing scale before relying on measurements. Native OCR, compression, CAD/IFC conversion, plugins and printing require the Windows edition and remain subject to separate acceptance checks.
- **Calc:** Create an estimate, enter quantities and resource rates, and review totals before exporting. Preserve project files as well as reports.
- **Open Vision Studio:** Create or import a schedule, review calendars, dependencies, task dates and resources, then recalculate. An imported schedule may use conventions different from the default project profile. Review warnings and the project's scheduling options before accepting date differences.
- **FEM Vision Studio:** Define nodes, members, supports, sections, materials and loads; solve; inspect equilibrium, deformation and checks. The deployed browser frontend now uses canonical v2 and the Render Rust calculation bridge. If the service is sleeping or busy, wait and retry; Windows package acceptance remains outstanding.
- **Vision Calculation Studio:** Select a module, enter project details and calculation inputs, then inspect results and reports. Several available templates do not yet contain verified calculation checks; their presence in the catalog is not evidence of completeness.
- **Field:** Record inspection details, attach project evidence and save the project before producing reports or handover documents. Invalid project JSON displays an error and preserves the active project; retry with a supported project file. Verify generated attachments, signatures and dates against the source records.
- **Speech:** Choose Import audio, select an English recording between 1 second and 10 minutes and below 50 MB, then transcribe. First use downloads the speech model; recognition runs locally in the browser. Open the resulting transcript to edit, copy or export it as text. Native dictation and meetings require the Windows runtime, models and audio devices and remain subject to acceptance testing.

Engineering outputs require review of units, assumptions, material properties, boundary conditions and the applicable reference standard. A successful solve, validation or export does not by itself approve an engineering design.

## Cloud files and recovery

The BIM and STL cloud services use anonymous private workspace cookies and temporary server storage. Keep that browser session to access its temporary results. Download your results promptly; a restart or hosting lifecycle event can remove them. A local display name does not recover cloud files.

If a tool fails, preserve the input file, the error text, the operation you attempted and the tool version. Use a smaller representative file to determine whether the problem is the input format or resource size. Do not overwrite the only source copy while troubleshooting.
