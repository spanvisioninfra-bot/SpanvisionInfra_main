# Spanvision Infra homepage release — 13 October 2026

Status: **deployed to production and verified**.

The homepage now uses a full-width landscape steel bridge cover behind the title and actions. Desktop preserves the entire landscape composition; phones select the original portrait artwork. Both dark and light themes are supported.

## Source and deployment

| Item | Value |
| --- | --- |
| Branch | `version/V.1.0` |
| Application commit | `d8f10de4c9a43518b1c7b03a391f5b170c8c07ad` |
| Canonical repository | [spanvisioninfra-bot/SpanvisionInfra_main](https://github.com/spanvisioninfra-bot/SpanvisionInfra_main/tree/version/V.1.0) |
| Mirror repository | [rashi-gupta-08/SpanvisionInfra_main](https://github.com/rashi-gupta-08/SpanvisionInfra_main/tree/version/V.1.0) |
| Production website | [spanvision-infra.vercel.app](https://spanvision-infra.vercel.app/) |
| Vercel project | `spanvision-infra`, team `spanvisioninfra-bot` |
| Deployment ID | `dpl_2hGgvFcCBPBktyXnwP7Co3rxhExd` |
| Deployment state | `READY`, production alias assigned |
| Production verification | 13 October 2026, 11:55 IST |

The application commit was pushed to both repositories and their release branch hashes were checked. The hub was published through the existing prebuilt Vercel upload workflow. The main website was updated; tool pages and Render services continue using their existing deployments.

## Verification

- Production build completed successfully.
- All seven homepage browser check groups passed against the live website.
- Ten layout combinations passed: widths 320, 390, 820, 1440 and 1920 pixels in dark and light themes.
- Both live bridge image files matched the committed assets byte for byte.
- The landscape cover filled the desktop hero width without clipping or horizontal overflow. The following section had no gap.
- Tool navigation displayed all 16 tools, the scan/OCR dialog opened, page scrolling worked, and image loading failure preserved the headline and actions.
- The suite status endpoint returned HTTP 200 with 16 available tool links. No uncaught browser JavaScript errors were recorded.

Local evidence is saved in `D:/SpanvisionToolchain/bridge-release-2026-10-13/`: `deployment-attempt.json` contains the final deployment status, and `live/results.json` plus screenshots contain the live checks. These local records are not required to run the website.

See [the landing cover guide](../suite-hub/BRIDGE-EXPERIENCE.md) for setup, asset details and the image generation prompt.
