# Public tool subdomains

The suite catalogue and launcher use these addresses from `production.json`:

| Tool | Workspace |
| --- | --- |
| 3D CAD | https://cad.spanvisioninfra.com/workspace |
| 2D Vision Studio | https://cad2d.spanvisioninfra.com/workspace |
| Vision PDF Workspace | https://visionpdfworkspace.spanvisioninfra.com/workspace |
| Speech Vision Studio | https://speechvision.spanvisioninfra.com/workspace |
| Vision IFC Studio | https://ifc.spanvisioninfra.com/workspace |

The existing tool IDs and Vercel projects remain linked to their original access
grants, trial accounting and saved project identities. The launcher still checks
access and transfers a private tool session before entering `/workspace`.

## Existing domains

All listed subdomains are the existing public tool domains. CAD's public display
name is now 3D CAD, while its address stays `cad.spanvisioninfra.com`. PDF's
display name is Vision PDF Workspace and uses its existing
`visionpdfworkspace.spanvisioninfra.com` address. No new DNS records or
nameserver changes are required.

## Publishing

The hub and PDF frontend have been rebuilt. Packaging CAD refreshes its public
name and browser locale titles without rebuilding the WASM engine. Publish
`hub`, `cad` and `pdf` to their existing Vercel projects. The Speech and 2D CAD
destination changes are in the hub manifest; their existing domains already
respond with the expected private access redirect. Render needs no update for
this change.
