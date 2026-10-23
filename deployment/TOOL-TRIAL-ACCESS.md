# Two-day trial and paid tool access

Each verified account receives **three launches total across 13 trial-enabled tools on each of two trial days**. The first launch starts the trial. A trial day is a 24-hour period from that start, so the trial ends exactly 48 hours later and allows at most six launches. Creating an account alone does not start the trial.

Opening a tool from the catalogue requests a launch. Reloading an already authorized tool session does not spend another launch. Trial sessions end at the current trial-day boundary; returning through the launcher then requests another launch. When the daily allowance is used, the user can wait for the second trial day or subscribe. After 48 hours, a paid plan is required. Existing Studio and Team prices are unchanged. Super admin and valid Studio/Team admin grants bypass trial limits. A payment return URL, browser profile or client-supplied role never unlocks access.

Usage is stored in PostgreSQL. The launch operation locks the account row and uses an idempotency key so concurrent tabs and retries cannot create extra uses. The counter follows the account across devices and browser-data resets.

All deployed static tool requests pass through Vercel middleware before files or backend rewrites. BIM, STL and the FEM engine also enforce access on Render, with only their health endpoints public. A short-lived server check cache lasts at most 15 seconds. The shared browser guard checks access every 30 seconds and covers an already open page when its session ends. Tools receive a tool-bound access ticket through a POST handoff and keep it in a secure HttpOnly host cookie. Tool projects receive no database or account-provider secrets. Local development previews remain available on localhost.

## Enable in production

BIM Validator (`bim`), STL-3D Studio (`stl`) and FEM Studio (`fem`) are **Coming soon for trial users**. The other 13 tools share the unchanged three-launch daily allowance. This policy is published by the account API and shared with the catalogue. New backend trial launches are rejected before the database allocator runs, and previously issued backend trial tickets are rejected at their next access check. Verified paid plans and valid admin access retain all 16 tools. The allocator's list of all 16 IDs remains necessary for paid grants; no database migration is needed for this availability change. Deploy the rebuilt main website to publish the new policy and text. Direct backend URLs also require the previously added access guards to be deployed on Render.

1. Run `commerce/neon-tool-trial.sql` in the existing application's Neon SQL editor, **after** the base `commerce/neon-schema.sql` migration. The migration is additive and can be run again. It does not modify Neon Auth tables or reset existing trials. The legacy Supabase deployment uses `commerce/tool-trial.sql` after its existing base schema instead.
2. Keep the main website's existing server-only `DATABASE_URL`, Neon Auth settings, `SESSION_SECRET` and pinned `SUPER_ADMIN_USER_ID`. Do not rotate the session secret as part of this rollout. Set `PRICING_APPROVED=true` for the approved existing Studio/Team plans. Supply the matching Stripe/Razorpay price or plan IDs, private provider keys and webhook secrets from `commerce/.env.example` in Vercel's server settings. Payment-provider confirmation must reach the existing verified webhook before paid access activates. Do not publish secrets to Git or use `VITE_` for them.
3. Deploy the **hub first** so `/api/account/tool-launch`, `/api/account/tool-status` and `/api/account/tool-verify` are available. Confirm that sign-in and the database connection work before deploying tool guards.
4. Refresh the shared tool presentation files, then package and deploy **all 14 Vercel tools**, including IFC and Field. The packaging script automatically adds the private access middleware to each tool. No editor engine needs recompiling for this guard.
5. Deploy **spanvision-bim**, **spanvision-stl** and **spanvision-fem-engine** on Render from the reviewed commit. Keep each existing service's repository/branch unless you choose to change it. A push to a personal fork does not deploy a service connected to the company repository.
6. Tool projects and Render default to `https://www.spanvisioninfra.com` for access checks. If the account website uses a different origin, set the non-secret `SPANVISION_ACCOUNT_ORIGIN` to that exact HTTPS origin on every tool and backend. Keep account APIs public for authentication and server-to-server ticket checks; payment webhooks retain their signature verification.
7. Hard-refresh existing browser tabs. Verify anonymous direct tool URLs require sign-in, a test account's fourth launch is blocked, a verified paid test subscription unlocks tools, and super admin remains unrestricted. Do not start a real charge as a deployment check.

Existing open pages or copies saved before deployment cannot be remotely withdrawn. The access controls apply to the updated hosted deployments. Do not claim the live site is locked until the migration, payment setup and every deployment above have been verified.

## Build and package locally

The account/hub build is already prepared for this change. After further source edits, rebuild the hub with its normal build command. Refresh the tools and package with:

```powershell
node deployment/refresh-tool-branding.mjs
node deployment/package-vercel.mjs hub
foreach ($tool in @('cad','cad2d','pdf','ifc','calc','planner','fem','frame','calculation','geo','speech','field','pointcloud','pile')) {
  node deployment/package-vercel.mjs $tool
  if ($LASTEXITCODE -ne 0) { throw "Packaging failed: $tool" }
}
```

## Verification

- `npm.cmd --prefix commerce test`: account, billing, signed ticket and Vercel middleware checks.
- With the isolated PGlite runtime supplied through `PGLITE_MODULE`, run `npm.cmd --prefix commerce run test:trial-schema` for migration replay, restricted permissions, concurrent requests, idempotency, trial boundaries, forged claims and real SQL-backed HTTP access.
- `python -m unittest deployment.test_tool_access deployment.test_upload_limits`: cloud guards and upload bounds. Use the existing BIM Python environment.
- `SPANVISION_SERVICE=bim python -m unittest deployment.test_cloud`: real BIM workspace, import, processing and validation routes behind controlled test access, using temporary data only.
- `node deployment/verify-tool-trial-browser.mjs`: controlled desktop dark/mobile light checks for sign-in, daily limit, expiry, ticket handoff, retry, account usage and the existing paid-plan selection. Results are in the ignored `qa/deployment/output/tool-trial-2026-10-22/` directory.

The account/access checks, isolated SQL checks, generic cloud guards, real BIM routes and hub production build pass locally. The full STL backend integration check could not start because the existing local STL Python environment is incomplete (`pyproj.Transformer` is unavailable). Its shared access guard is covered by the isolated tests; verify the full STL service after Render installs the complete pinned requirements during its build.

Vercel packaging follows its documented [Build Output middleware routes](https://vercel.com/docs/build-output-api/features) and [Edge Function configuration](https://vercel.com/docs/build-output-api/primitives).

No production database migration, payment, Git commit, push or deployment is performed by these local checks.
