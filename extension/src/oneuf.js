// Isolated content script on ONE.UF. Receives the audit from capture.js,
// removes personal data, and keeps it in this tab's memory until the popup
// asks for it. Nothing is read before the student agrees to the data notice,
// and nothing is written to disk.

let captured = null; // { audit, summary, capturedAt }

window.addEventListener("gatorplan:audit-captured", async (event) => {
  if (typeof event.detail !== "string") return;
  const { consentVersion } = await chrome.storage.local.get("consentVersion");
  if (consentVersion !== CONSENT_VERSION) return;

  let data;
  try {
    data = JSON.parse(event.detail);
  } catch {
    return;
  }
  if (!isDegreeAudit(data)) return;
  const audit = redactAudit(data);
  captured = { audit, summary: summarizeAudit(audit), capturedAt: Date.now() };
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  switch (message?.type) {
    case "oneuf:status":
      sendResponse({
        ready: captured !== null,
        onAuditPage: location.pathname.startsWith("/degreeaudit"),
        summary: captured?.summary ?? null,
      });
      break;
    case "oneuf:audit":
      sendResponse({ audit: captured?.audit ?? null });
      break;
  }
});
