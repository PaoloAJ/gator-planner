# Chrome Web Store submission

Answers for each field of the developer dashboard. Keep them in sync with
the in-extension notice (`popup/popup.html`) and the hosted privacy policy
(`web/src/app/privacy/page.tsx`, served at `/privacy`). If any of the three
changes, bump `CONSENT_VERSION` in `src/config.js` so users are asked again.

## Store listing

**Name:** GatorPlan Degree Audit Import

**Summary (132 chars max):**
Send your UF degree audit from ONE.UF to GatorPlan's degree planner, with your name, UFID, grades, and GPA removed.

**Description:**

> Plan the rest of your degree with GatorPlan without copying anything from DevTools.
>
> 1. Open your degree audit on ONE.UF.
> 2. Click the GatorPlan button.
> 3. Click "Open in GatorPlan". Your audit opens in GatorPlan's degree planner, ready to plan.
>
> Privacy by design:
> • Reads only your degree audit, and only after you agree to a short notice.
> • Removes your name, UFID, grades, and GPA in your browser before anything is sent.
> • Sends nothing until you click. You can also save the redacted audit as a file instead.
> • Stores nothing but your consent. No ads, analytics, or tracking.
>
> GatorPlan is a student project. It is not affiliated with or endorsed by the University of Florida.

**Category:** Education

**Screenshots (1280×800):** the popup's consent screen, the "Audit found" screen
over a ONE.UF degree audit (blur the student name), and GatorPlan's
preferences step with the "Loaded your degree audit" notice.

**Do not** use UF logos, the Gator head, or UF's name in a way that implies
endorsement (Chrome Web Store impersonation policy and UF trademark rules).

## Privacy practices tab

**Single purpose:**
Moves the student's own UF degree audit from ONE.UF into GatorPlan's degree
planner, with personal identifiers removed.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Remembers that the user agreed to the data notice (`chrome.storage.local`). Holds the redacted audit in memory (`chrome.storage.session`) for up to 10 minutes while the GatorPlan tab opens; it's deleted once that tab takes it or closes. |
| Host: `https://one.uf.edu/*` | Reads the degree audit response that the user's ONE.UF degree audit page loads (the request ending in `/loaddegreeaudit/`). The script must run on all of `one.uf.edu` because ONE.UF is a single-page app: the audit page is often opened from another ONE.UF page without a full reload. Other responses aren't read. |
| Host: GatorPlan's origin | Delivers the audit to the GatorPlan tab the extension opened, through a same-origin `postMessage`. |

**Remote code:** No. All JavaScript is bundled in the package. There's no
`eval`, no remote scripts, and no build step or minification.

**Data usage (what is collected):**

- [x] **Website content**: the degree audit from ONE.UF (programs,
  requirements, course history), sent to GatorPlan only when the user clicks
  "Open in GatorPlan".
- [ ] Personally identifiable information: name, UFID, IDs, and email are
  removed in the browser before sending.
- [ ] Health, financial and payment, authentication, personal communications,
  location, web history, user activity: not collected.

**Certifications** (check all three):

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://<GatorPlan origin>/privacy`

## Notes for the reviewer

> The extension's main feature needs a University of Florida GatorLink login,
> which reviewers won't have. How it works:
>
> • `src/capture.js` runs in the page's main world on one.uf.edu. It wraps
>   `fetch` and `XMLHttpRequest`, but only to read the response of the
>   degree audit request (URL path ending `/loaddegreeaudit/`). It passes the
>   response text to the isolated content script with a `CustomEvent`. Every
>   other request is untouched.
> • `src/oneuf.js` drops it unless the user has agreed to the notice. It checks
>   the shape, removes identifiers (`src/redact.js`), and keeps the result in
>   tab memory.
> • Clicking "Open in GatorPlan" in the popup opens GatorPlan.
>   `src/gatorplan.js` hands it the audit once, via `src/background.js`.
>
> To check the GatorPlan side without a UF account, open GatorPlan's degree
> planner and upload the sample audit in the repository at
> `server/internal/audit/testdata/sample_audit.json`.
