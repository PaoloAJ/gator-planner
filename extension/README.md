# GatorPlan Chrome extension

Moves a student's degree audit from ONE.UF into GatorPlan's degree planner,
replacing the "copy the response out of DevTools" step.

```
ONE.UF degree audit tab                       GatorPlan tab (/?import=extension)
┌──────────────────────────────┐             ┌─────────────────────────────────┐
│ capture.js  (page world)     │             │ gatorplan.js ⇄ page postMessage │
│   sees /loaddegreeaudit/ ──► │             │   (lib/extension.ts in web/)    │
│ oneuf.js    (isolated)       │             └──────────────▲──────────────────┘
│   consent? → redact → memory │                            │ once, ≤10 min
└──────────────┬───────────────┘   popup.js   background.js │
               └──── "Open in GatorPlan" ──► storage.session┘
```

- **No guessing at UF's API.** The extension doesn't call ONE.UF itself. It
  reads the response the audit page already fetches (any `fetch` or XHR whose
  path ends in `/loaddegreeaudit/`). So it uses whatever URL, method, and
  headers ONE.UF uses, and the student's own session.
- **Redacted at the source.** `src/redact.js` drops `name`, `ufid`, IDs,
  email, grades, and every GPA field before the audit leaves the tab. The server
  needs none of them; `test/redact.test.mjs` checks that every field
  `server/internal/audit` reads survives.
- **Consent first.** Nothing is read until the student agrees in the popup.
  Bumping `CONSENT_VERSION` in `src/config.js` asks everyone again.
- **Minimal permissions:** `storage`, plus content scripts on `one.uf.edu`
  and GatorPlan's origin. No `tabs`, `scripting`, `webRequest`, or remote code.

## Develop

1. Run the web app on `http://localhost:3000` (`cd ../web && npm run dev`).
2. In Chrome, go to `chrome://extensions`, turn on Developer mode, click
   **Load unpacked**, and pick this folder.
3. Open <https://one.uf.edu/degreeaudit/>, click the extension, agree, reload
   the page, then click **Open in GatorPlan**.

```sh
node --test                          # redaction tests
python3 scripts/make_icons.py        # redraw icons/
```

If UF renames the endpoint, update `AUDIT_PATH` in `src/capture.js`.

## Publish

```sh
GATORPLAN_URL=https://your-gatorplan-domain node scripts/package.mjs
```

This writes `dist/` with the production origin in place of `localhost:3000`
and zips it as `gatorplan-extension-<version>.zip` for upload. Before the
first submission:

- Deploy the web app so `https://your-gatorplan-domain/privacy` is live, and
  set `CONTACT_EMAIL` in `web/src/app/privacy/page.tsx`.
- Fill in the dashboard from [STORE_LISTING.md](STORE_LISTING.md).
- Bump `version` in `manifest.json` for each upload.
