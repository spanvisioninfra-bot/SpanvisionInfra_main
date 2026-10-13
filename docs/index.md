# Spanvision Infra documentation

Updated: 10 October 2026.

Start with the readiness report to see which behavior has been verified and which release work remains. The complete browser and Windows suite is not yet approved for production. Planner's required full verification passed on 9 October, including 333 browser tests. The website now opens Home first, with Pricing, FAQ and protected account/admin screens. See the [10 October deployment record](deployment-2026-10-10.md); the [6 October record](deployment-2026-10-06.md) preserves earlier verification limits.

| Document | Purpose |
| --- | --- |
| [Simple deployment guide](../DEPLOYMENT-GUIDE.md) | Each tool and where it is deployed |
| [Home, accounts and admin](../commerce/README.md) | Draft pricing, provider setup, super-admin activation, API and database permissions |
| [10 October release](deployment-2026-10-10.md) | Source publication, cloud deployment results and remaining account/payment setup |
| [Production readiness](production-readiness.md) | Evidence and remaining release gates for all 16 tools, including browser/native differences |
| [User guide](user-guide.md) | Local workspaces, files, OCR, drawing, document exports, recovery and known feature limits |
| [Verification](verification.md) | Repeatable test commands, output inspection and the limits of each check |
| [Operations](operations.md) | Build prerequisites, hosting, anonymous cloud workspaces, deployment and Windows acceptance |
| [Engineering standards](engineering-standards.md) | India, US and UK requirements, implemented reference cases and outstanding engineering review |

Latest verified additions include Frame's seven browser document downloads and 48 visually reviewed PDF pages, 2D CAD drawing and file recovery, PDF annotation/save/reopen with page rotation and malformed-file recovery, OCR cancellation/error recovery, Field project-import validation and recovery, and the website's Home/Pricing/FAQ/account/admin flows. Planner's full verification subsequently passed on 9 October; its earlier failed runs remain historical evidence. Account/admin success paths use explicit provider mocks and isolated SQL tests; genuine sign-in, email and billing verification await provider configuration. Machine-specific CNC verification remains deferred by user choice; generic CNC files remain clearly marked as unverified.

Evidence is recorded under `qa/readiness`. Check completed result timestamps and logs before reporting release status. Successful tests do not establish that every feature or engineering scenario is correct.
