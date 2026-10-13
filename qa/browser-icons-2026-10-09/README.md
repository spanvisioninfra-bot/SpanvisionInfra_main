# Shared browser icons — 9 October 2026

All 16 browser tools use the supplied Spanvision Infra curved-S company mark. The shared packaging replaces legacy tab and touch icons, adds SVG and PNG fallbacks, and follows the tool's dark/light appearance setting. Browser editors and native application icons are unchanged.

`branding/browser-icons.mjs` generates the checked-in assets in `deployment/browser-icons/`. `deployment/browser-identity.mjs` applies them after application compilation. Vercel packaging and the BIM/STL Docker build both use that same installer. New asset URLs prevent reuse of the old GW favicon.

Verification: `node qa/browser-icons-2026-10-09/verify-local.mjs` checks all 16 packaged tools, old icon removal, repeated packaging, image decoding and dark/light transitions. The initial run passed 17 checks. Production verification records are written separately after deployment.

Only the icon assets, their generation/packaging code, the Docker integration and this verification source belong to this change. The other local website edits are excluded from its Git commit.
