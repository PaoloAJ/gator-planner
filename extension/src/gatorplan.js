// Content script on GatorPlan. When the page asks (it does so only when it
// was opened with ?import=extension), fetches the waiting audit from the
// background worker and posts it to the page. Messages stay same-origin.

const FROM_EXTENSION = "gatorplan-extension";
const FROM_PAGE = "gatorplan-web";

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== FROM_PAGE || event.data.type !== "request-audit") return;
  let audit = null;
  try {
    ({ audit } = await chrome.runtime.sendMessage({ type: "handoff:take" }));
  } catch {
    // Extension was reloaded or updated; the page falls back to paste/upload.
  }
  window.postMessage({ source: FROM_EXTENSION, type: "audit", audit }, location.origin);
});

// Lets a page that asked before this script loaded ask again.
window.postMessage({ source: FROM_EXTENSION, type: "ready" }, location.origin);
