# Spanvision Infra documentation

Updated: 6 October 2026.

Start with the readiness report to see which behavior has been verified and which release work remains. The complete browser and Windows suite is not yet approved for production. The hub and 15 tools were deployed from `version/V.1.0` on 6 October; Planner's update awaits its required verification gate. See the [deployment record](deployment-2026-10-06.md).

| Document | Purpose |
| --- | --- |
| [Production readiness](production-readiness.md) | Evidence and remaining release gates for all 16 tools, including browser/native differences |
| [User guide](user-guide.md) | Local workspaces, files, OCR, drawing, document exports, recovery and known feature limits |
| [Verification](verification.md) | Repeatable test commands, output inspection and the limits of each check |
| [Operations](operations.md) | Build prerequisites, hosting, anonymous cloud workspaces, deployment and Windows acceptance |
| [Engineering standards](engineering-standards.md) | India, US and UK requirements, implemented reference cases and outstanding engineering review |

Latest verified additions include Frame's seven browser document downloads and 48 visually reviewed PDF pages, 2D CAD drawing and file recovery, PDF annotation/save/reopen with page rotation and malformed-file recovery, OCR cancellation/error recovery, and Field project-import validation and recovery. Planner's updated build passes; its full release gate remains outstanding after disk/memory interruptions and a completed planning run returning exit 1 despite green scheduling cases and timezone results. Machine-specific CNC verification remains deferred by user choice; generic CNC files remain clearly marked as unverified.

Evidence is recorded under `qa/readiness`. Check completed result timestamps and logs before reporting release status. Successful tests do not establish that every feature or engineering scenario is correct.
