# Spanvision Infra — Landing cover

The homepage uses a landscape adaptation of the supplied steel bridge artwork as its desktop cover. The generated image is stored in `public/bridge-steel-cover-wide.png` (1916 × 821). The original portrait remains unchanged in `public/bridge-steel-cover.png` and serves phones. The homepage does not initialize WebGL, render a 3D model, load Three.js, move the camera or display animation controls.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
cd suite-hub
npm ci
npm run dev
```

Open http://127.0.0.1:4230/?appearance=dark. Use `?appearance=light` for the light theme. Stop an existing preview on port 4230 before starting another.

For a production build and static preview:

```sh
npm run build
npm run preview
```

Deploy `dist` with the existing frontend deployment workflow. The cover does not require a backend, account or graphics acceleration. Account and payment features still require their existing production configuration.

## Presentation

- The landscape artwork fills the entire desktop hero width behind the text. Hero height follows the image's aspect ratio, with a minimum height for the headline and actions. The entire image fits without cropping or stretching.
- Below 768 pixels, the browser selects the original portrait artwork and centers it toward the bottom. The original uploaded PNG remains unchanged.
- The dark theme displays the selected artwork. The light theme applies CSS inversion and grayscale for dark drafting lines on a light background, without changing the asset.
- Theme gradients keep the headline, description and actions readable over the artwork.
- The hero and adjoining workspace section remain connected without a gap. The image cannot intercept clicks or scrolling.
- If the asset fails to load, it is hidden and the page background, text and actions remain available.

## Files

| File | Purpose |
| --- | --- |
| `public/bridge-steel-cover.png` | Exact uploaded bridge artwork |
| `public/bridge-steel-cover-wide.png` | Landscape desktop adaptation |
| `src/MarketingHome.jsx` | Image cover, headline and homepage actions |
| `src/marketing.css` | Full-width uncropped artwork, responsive layout, light/dark styling and text gradients |
| `test/bridge-browser.mjs` | Homepage cover and navigation checks; filename retained for compatibility |

The earlier `ArchitectureDrawing.jsx` is no longer imported into the homepage or included in its production JavaScript. The published homepage uses the static cover, with no Three.js dependency required for this change.

## Verification

Start the preview, install the root project's development dependencies and ensure Google Chrome is available, then run from `suite-hub`:

```sh
npm run test:cover:browser
```

The existing `test:bridge:browser` command runs the same cover checks. Screenshots/results default to `test-results/cover`; set `BRIDGE_QA_OUTPUT` to change the output directory.

Checks cover both assets' exact served byte identities, selection of landscape/portrait sources, full desktop artwork width, the entire artwork fitting inside the hero without clipping, both themes at 320, 390, 820, 1440 and 1920 pixels, absence of 3D/GPU initialization, layout overflow, section spacing, tool navigation, all 16 tools, scan/OCR access, page scrolling and failed image loading.

Verified on 12 October 2026: the production build and all seven cover browser check groups passed. Desktop artwork fills the hero width; neither source is cropped. All ten tested theme/viewport combinations had no section gap or horizontal overflow, and there were no uncaught JavaScript errors. Local screenshots/results are in `D:/SpanvisionToolchain/bridge-wide-preview-2026-10-12/`.

Publication uses the existing `version/V.1.0` release branch and the existing Vercel `spanvision-infra` project. Build the hub, then package it with `node deployment/package-vercel.mjs hub`. The package preserves account API routes, tool launch URLs and the suite status endpoint. Uploading this homepage does not require rebuilding the independent tool sites or changing Render services.

Rechecked on 13 October 2026 before publication: the production build, all seven browser check groups and byte identity of both packaged image assets passed. The deployment package retained all seven routes, including account APIs and suite status. The checks cover homepage presentation and navigation; they do not certify every feature of the independent tools.

Published on 13 October 2026 from application commit `d8f10de4c9a43518b1c7b03a391f5b170c8c07ad`, pushed to both release repositories. Vercel deployment `dpl_2hGgvFcCBPBktyXnwP7Co3rxhExd` is ready at [spanvision-infra.vercel.app](https://spanvision-infra.vercel.app/). All seven check groups also passed against production, including ten theme/viewport combinations and both asset byte identities. See [the deployment record](../docs/deployment-2026-10-13.md).

## Artwork generation

Created with the built-in imagegen tool in edit mode, using the original uploaded portrait as the edit target. The output was copied into the project's public assets; the original file was preserved. Final generation prompt:

```text
Use case: compositing / landscape recomposition.
Asset type: full-width desktop landing page background for Spanvision Infra.
Input image 1 is the edit target: the supplied portrait artwork of a realistic silver steel through-truss bridge on a near-black engineering blueprint backdrop.
Primary request: transform and extend this portrait composition into an ultrawide LANDSCAPE hero image, approximately 21:9, filling a wide desktop screen. Recompose the bridge to fit the wide frame rather than stretching or cropping the portrait.
Preserve the distinctive silver riveted steel through-truss construction, overhead steel bracing, asphalt road with lane markings and guardrails, massive pale concrete piers, subtle engineering grid and fine wireframe elevations below the bridge. Retain the photorealistic metallic detail and monochrome premium engineering aesthetic.
Composition: the main bridge runs diagonally from the lower-left region across the lower middle toward the upper-right, filling the width with a dramatic three-quarter perspective. The principal truss spans, top beams, and concrete pier bases should be comfortably inside the image, with safe margins; do not crop their essential structure. Keep the bridge mostly within the central 65% of the image height so responsive screen crops only remove peripheral dark space. Leave a near-black, quiet upper-left region (roughly the left 45% and top 45%) for website title and copy. Add fine restrained blueprint lines across the full width so the artwork does not look like a small image confined to the right side. Black background should blend seamlessly into the existing black website.
Lighting: realistic silver steel and pale concrete with crisp restrained highlights, dark environmental shadows.
Constraints: an actual raster background image, no website UI, no text, no logos, no captions, no watermarks, no people; no suspension cables or suspension towers. Do not simply place the portrait on a black landscape canvas. Expand and recompose the bridge artwork to use the landscape format.
```

Updated: 13 October 2026.
