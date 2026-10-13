# Spanvision Infra release — 10 October 2026

Release branch: **`version/V.1.0`**. Source repository: [SpanvisionInfra_main](https://github.com/spanvisioninfra-bot/SpanvisionInfra_main), with the same branch mirrored to [rashi-gupta-08's repository](https://github.com/rashi-gupta-08/SpanvisionInfra_main).

## Changes included

- Company logo in the site's dark/light palette, renamed tool labels, new tool icons and social footer links.
- Animated architecture drawing, replacing the globe; reduced-motion support remains available.
- A themed splash opens the chosen workspace directly. CAD, 2D CAD and Planner preserve recovery while skipping their introductory landing/welcome step on suite launch.
- Existing website opens Home first, with Pricing, FAQ, sign-in, sign-up, verification, recovery and account screens above the toolkit.
- Server-side account and hosted billing integrations, signed webhook handling and encrypted HttpOnly sessions.
- Protected user/plan dashboard for `spanvisioninfra.admin@gmail.com`, with verified identity/UUID binding and atomic PostgreSQL audit records.
- Render blueprint now matches the existing `version/V.1.0` service branch and includes shared browser assets in BIM/STL build filters.

## Deployment plan and status

Completed on **10 October 2026**. Application commit: `a54f958b`; deployment-script fixes: `30442a33`. Both commits are pushed to `version/V.1.0` in the canonical and rashi-gupta-08 repositories.

The existing main site and all 14 static tool projects were refreshed on Vercel. All three Render services are **live** from `30442a334e79a00f0740e28821f1b00a26b5a2f1`, using the existing free Singapore services. BIM/STL live build filters now match the blueprint. The final documentation commit does not change deployed application behavior.

Live verification completed at **21:42 IST**: Home/account/admin checks passed, all 17 website/tool pages passed font/CSS and both-theme checks, Render health/readiness endpoints passed, and the FEM rectangle area/inertia reference passed directly and through Vercel. Anonymous admin APIs returned 401 without private data. No sample admin session was published.

| Project | Deployment ID |
| --- | --- |
| Main Spanvision Infra website | `dpl_2racRDPb2ABvrhy3ahe27L8qtXKv` |
| Vision CAD Studio | `dpl_8NYiGz89D3zcYGfMCGjZhfK5NwP7` |
| 2D Vision Studio | `dpl_FQp6AwtnUm4Wxq6JUjKGNHLtDF6s` |
| Vision Portable Document Studio | `dpl_7sKUQqgKc2yhh4Rj1R6BBEBnFmxz` |
| Vision IFC Studio | `dpl_AnnF2YLdPkWozdTt6aiGLevJ6xgb` |
| Calc Vision Studio | `dpl_FK2epiu9adB323iC8FEbxDzKiLif` |
| Open Vision Studio | `dpl_7uGN1jXZTRpuYxBGbmCzh8H18r7G` |
| FEM Vision Studio | `dpl_32D75qUjBebxtR7DFwzBwrevyk6U` |
| Frame Vision Studio | `dpl_FkBGUkS2SGN5fAZwSCoTXY1a9ibE` |
| Vision Calculation Studio | `dpl_9HTXuwqPkYRcn2ZamCY6WZ4kNnW9` |
| Vision Geotech Studio | `dpl_9eSG5zXhHY9nNY5ikMwWmk1m9TPW` |
| Speech Vision Studio | `dpl_F6hfPFJtaPFCxPUuYDt7EwPhbcNn` |
| Vision Field Studio | `dpl_DVc9HoQxkcemvcJP6uCNQZBdbqtb` |
| Vision Pointcloud Studio | `dpl_GKtEcjTDwM4xzbsqESb5Gj8EVvNY` |
| Vision Pile Studio | `dpl_9dL54cnHWnZ1f3aWZWQpyLDcF9wS` |
| bim | `dep-db566249v7es738q2r1g` |
| fem-engine | `dep-db566bad0e5s73ebg8b0` |
| stl | `dep-db566249v7es738q2r40` |

Exact URLs, commit hashes and timestamps are in [deployment-record.json](../qa/deployment/release-2026-10-10/deployment-record.json). Live API results are in [api-checks.json](../qa/deployment/release-2026-10-10/api-checks.json); page/theme results are in [workspace-checks.json](../qa/deployment/release-2026-10-10/workspace-checks.json).

The machine ran out of C: space during a deployment-record write. Generated browser builds were preserved on D: behind junctions, the record was recovered from successful Vercel CLI logs, and the publisher now writes its report atomically and resolves build junctions before packaging. No source or user files were deleted.

| Application | Hosting |
| --- | --- |
| Main site, account/admin APIs | Existing `spanvision-infra` project on Vercel |
| CAD, 2D CAD, PDF, IFC, Calc, Planner, FEM frontend, Frame, Calculation, Geotech, Speech, Field, Pointcloud, Pile | Their existing Vercel projects |
| `spanvision-fem-engine` | Existing free Render service, Singapore |
| `spanvision-bim` | Existing free Render service, Singapore |
| `spanvision-stl` | Existing free Render service, Singapore |

Vercel uses explicit prebuilt application uploads; pushing Git alone does not rebuild those independent projects. Render builds the specified release commit from the canonical repository. No new hosting plan, database or payment account is created by this release. Render's temporary workspaces can reset during redeployment; downloaded project/results files remain the durable copy.

## Verification

- All **31** account/billing/admin and production URL-resolution tests passed on 10 October.
- The SQL migration/admin permission/atomic rollback test previously passed against isolated PGlite/PostgreSQL, as described in the [account guide](../commerce/README.md).
- Home and admin browser checks passed locally and on the live site in dark/light and mobile layouts. Authenticated provider paths use explicit mocks.
- All 16 themed workspace launches passed the 9 October live browser check. Planner's full required verification passed, including 333 browser tests; its compressed log accompanies this release.
- CAD's retained JavaScript/WASM engine was hash-checked against production; this release changes its browser loader and does not rebuild the unchanged Rust engine.

These checks cover the recorded flows and deployment behavior. They do not certify every button, engineering calculation or Windows installer as production ready. See [production readiness](production-readiness.md) for remaining application acceptance work.

## Setup still required

**Online accounts, actual admin activation and paid subscriptions are not active.** No Supabase project exists yet, and auth/payment credentials and approved prices are absent. The 16 anonymous workspaces remain accessible.

Create/configure Supabase, apply `commerce/schema.sql`, enable verified email/SMTP, register and verify the designated admin email, pin `SUPER_ADMIN_USER_ID`, and test real account recovery and authorization before activation. Finalize prices and provider plans, configure signed webhooks and complete genuine provider sandbox checks before enabling checkout. See [the activation guide](../commerce/README.md).

The local sample admin server at port 4232 is QA only. Its mock session, users and grants are excluded from production deployment packages.
