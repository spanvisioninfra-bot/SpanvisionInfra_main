# Publish the STL map overlap fix

The location button and its status now sit in a toolbar below the map. Area instructions remain inside the canvas. Resizing keeps the current coordinates, and the mobile Settings tab hides the entire map workspace.

Verified locally: the STL build and eight browser cases, covering desktop/mobile, light/dark, saved locations, permission denial and area selection. Nothing has been committed, pushed or deployed automatically.

## Review and push to your repository

The current `origin` points to `spanvisioninfra-bot/SpanvisionInfra_main`. The explicit push URL below targets your personal repository, `rashi-gupta-08/SpanvisionInfra_main`, without changing any remotes.

```powershell
Set-Location -LiteralPath 'C:\Users\dell\Documents\ChatGPT\own CAD'

git add -- spanvision-stl-3d-map-workspace/web/app.js spanvision-stl-3d-map-workspace/web/index.html spanvision-stl-3d-map-workspace/web/style.css deployment/verify-stl-map-layout.mjs deployment/STL-MAP-FIX.md
git diff --cached --name-status
git diff --cached --check
git diff --cached --ignore-space-at-eol

git commit -m "Move STL location controls below the map"
git push https://github.com/rashi-gupta-08/SpanvisionInfra_main.git HEAD:version/V.1.0
```

Review the staged list before committing. Only the five named files belong to this fix; posts, reels, private environment files and generated QA screenshots are excluded. Do not use a force push if Git reports that the destination branch has newer commits.

## Publish STL on Render

1. Open Render and select **spanvision-stl**.
2. Under **Settings → Build & Deploy**, confirm the connected repository and branch.
3. Ensure that connected branch contains this commit. If Render is connected to the company repository, pushing only to your personal repository will not update it. Transfer the reviewed fix to the connected source through your normal Git workflow, or deliberately reconnect Render to your personal repository and `version/V.1.0`.
4. Select **Manual Deploy → Deploy latest commit**.
5. Wait for the deployment to become live. Confirm the deployed commit matches the new commit from Git.
6. Open the STL workspace and press **Ctrl + Shift + R**. The location button should be in a horizontal bar below the canvas, separated from the area instructions.

This page is served by Render, so deploying the main website or another tool on Vercel will not publish this fix.

## Repeat the local check

After building STL with the existing build tooling, run `node deployment/verify-stl-map-layout.mjs`. Browser profiles, screenshots and results are written only to the ignored `qa/deployment/output/stl-toolbar-fix-2026-10-21` directory.
