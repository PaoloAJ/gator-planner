// Receives a degree audit from the GatorPlan Chrome extension (extension/).
// The extension opens GatorPlan at /?import=extension; its content script
// answers a same-origin postMessage with the audit, once.

const FROM_PAGE = "gatorplan-web";
const FROM_EXTENSION = "gatorplan-extension";

export const IMPORT_PARAM = "import";
export const IMPORT_FROM_EXTENSION = "extension";

/** Resolves with the audit, or null if the extension has none (or isn't installed). */
export function requestExtensionAudit(timeoutMs = 4000): Promise<unknown | null> {
  return new Promise((resolve) => {
    const ask = () => window.postMessage({ source: FROM_PAGE, type: "request-audit" }, window.location.origin);
    const finish = (audit: unknown | null) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(audit);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.source !== FROM_EXTENSION) return;
      if (e.data.type === "ready") ask();
      else if (e.data.type === "audit") finish(e.data.audit ?? null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", onMessage);
    ask();
  });
}
