# Frame layout and tool menus — 22 October 2026

The Frame ribbon now scrolls within its own container. The page cannot scroll sideways when keyboard focus reaches a control outside the visible ribbon, and the workspace tabs retain their height. This fixes the cropped left edge while keeping the remaining ribbon controls accessible.

About sections and open-source notice links have been removed from the tools' workspace navigation, File menus and preferences. Speech redirects old `#about` bookmarks to its workspace. CAD's About ribbon item and command have been removed. IFC and Field already had no corresponding workspace entries.

License, attribution and dependency notice files remain supplied separately. No project data, authentication settings or backend API behavior was changed.

## Verification

- The 15 JavaScript frontends passed navigation and preference checks for remaining About/notice entries.
- CAD's release build passed and opened a drawing in the browser. Its engine confirmed that the About command is unavailable and Options remains available.
- Frame passed 12 layout checks across light/dark mode, desktop/phone widths, and the CSS viewport equivalents of 150% and 200% browser zoom. Checks focus the last ribbon control to verify that keyboard navigation does not shift or crop the page.
- FEM, Calculation, Geotech and Pile import/export menu panels were checked after the cleanup.
- Installer checks: 3 passed. Product-identity checks: 4 passed.
- All 14 updated tool builds passed. The 12 updated static deployment packages are prepared locally; BIM and STL are built from source on Render.

The browser audit is read-only and does not connect local preview pages to production accounts or project databases. Reports and screenshots are stored in the ignored `qa/deployment/output/frame-layout-2026-10-22/` folder.

```powershell
node deployment/verify-workspace-chrome.mjs
```

Nothing has been committed, pushed or deployed by this task. Publishing requires the updated static tool packages on Vercel and the BIM/STL services on Render. The main website and FEM backend do not need redeploying for these menu/layout changes.
