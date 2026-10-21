# Spanvision Infra — Where Each Tool Is Deployed

| Tool | Deployed on |
| --- | --- |
| Main Spanvision Infra website | Vercel |
| Vision CAD Studio | Vercel |
| 2D Vision Studio | Vercel |
| Vision BIM Validator | Render |
| Vision Portable Document Studio | Vercel |
| Vision IFC Studio | Vercel |
| Calc Vision Studio | Vercel |
| Planner / Open Vision Studio | Vercel |
| FEM Vision Studio | Vercel (frontend) + Render (backend) |
| Frame Vision Studio | Vercel |
| Vision Calculation Studio | Vercel |
| Vision Geotech Studio | Vercel |
| Speech Vision Studio | Vercel |
| Vision STL -3D Studio | Render |
| Vision Field Studio | Vercel |
| Vision Pointcloud Studio | Vercel |
| Vision Pile Studio | Vercel |

## Live backend connections

| Frontend | Backend | Requests |
| --- | --- | --- |
| BIM on Render | `https://spanvision-bim.onrender.com` | Same-origin `/api/v1`, `/api/v2`, `/api/cloud` |
| STL on Render | `https://spanvision-stl.onrender.com` | Same-origin `/api` |
| FEM on Vercel | `https://spanvision-fem-engine.onrender.com` | Vercel proxies `/api/toetsing`, `/api/doorsnede` and `/api/engine-health` |

Public origins and production proxy routes are defined in `deployment/backend-services.mjs`.
The main website checks each service before opening its tool. Free Render instances
can need time to wake up; the splash and FEM client retry health checks for up to two
minutes. Calculations and uploads are sent once, and FEM checks are queued to match
the backend's one-process limit. Failed calls show an error instead of mock results.

BIM reads bypass the browser cache, and active validation jobs refresh progress
every two seconds after the previous request finishes. Cancel/reset stops polling
and discards late results. STL retrieves map data on **Load map data** and generates
exports on **Build**; loading an area explicitly refreshes the server's source cache.
These are request/response and job-polling connections, not WebSocket broadcasts.
STL does not continuously regenerate geometry or replace unsaved browser edits.

For local FEM previews, the default API is the live Render engine. To use another
API, set `SPANVISION_FEM_API_TARGET` in `fem-vision-studio/design-mockup/.env.local`
for Vite or in the shell for the suite preview. With Vite dev, the special value
`local` uses the local Rust executables; Vite preview then expects the local Python
API on port 10000. BIM's Vite dev proxy supports `VISION_API_TARGET`; its deployed
Render frontend needs no API environment variable.

Keep `DATABASE_URL` and other private credentials in Render's environment settings.
No `VITE_DATABASE_URL` is needed. BIM/STL use private browser workspace cookies;
they do not automatically share the main website's Neon login session. Session and
file persistence still depend on the existing Render service configuration.

To release these changes manually, rebuild `hub`, `fem`, `bim` and `stl` using
`node branding/build.mjs hub fem bim stl`. Package hub and FEM using
`node deployment/package-vercel.mjs hub` and `node deployment/package-vercel.mjs fem`,
then deploy those generated prebuilt outputs to their existing Vercel projects.
Redeploy BIM and STL on Render from the branch containing these changes. The FEM
engine itself needs no redeployment for this frontend integration.

Checks: `node --test deployment/backend-services.test.mjs deployment/fem-client.test.mjs`;
in `vision-bim-validator/viewer`, run `npm run test:run -- src/api/client.test.ts src/store/slices/validationSlice.test.ts`.
Run `node deployment/verify-backends.mjs` to check live data and the FEM reference
calculation through both Render and the existing Vercel frontend.
