const ONEUF_AUDIT_URL = "https://one.uf.edu/degreeaudit/";
const POLL_MS = 1000;
const WAIT_LIMIT_MS = 90_000; // ONE.UF can be slow to build an audit

const sections = ["consent", "elsewhere", "load", "waiting", "ready"];
let tab = null;

function show(id) {
  for (const s of sections) document.getElementById(s).hidden = s !== id;
  document.getElementById("footer").hidden = id === "consent";
}

function showError(message) {
  const el = document.getElementById("error");
  el.textContent = message ?? "";
  el.hidden = !message;
}

async function hasConsent() {
  const { consentVersion } = await chrome.storage.local.get("consentVersion");
  return consentVersion === CONSENT_VERSION;
}

/** Asks the ONE.UF content script for its state; null if it isn't running. */
async function tabStatus() {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "oneuf:status" });
  } catch {
    return null; // not a ONE.UF tab, or opened before the extension was installed
  }
}

function isOneUF(url) {
  return typeof url === "string" && url.startsWith("https://one.uf.edu/");
}

async function refresh() {
  showError(null);
  if (!(await hasConsent())) return show("consent");

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // tab.url is only visible for sites in the manifest, i.e. ONE.UF.
  if (!tab || !isOneUF(tab.url)) return show("elsewhere");

  const status = await tabStatus();
  if (status?.ready) return showReady(status.summary);

  const onAuditPage = status ? status.onAuditPage : new URL(tab.url).pathname.startsWith("/degreeaudit");
  document.getElementById("load-title").textContent = onAuditPage ? "Reload to read your audit" : "Open your degree audit";
  document.getElementById("load-text").textContent = onAuditPage
    ? "GatorPlan reads your audit as the page loads it. Reload the page once and it will be picked up."
    : "You're on ONE.UF. Go to your degree audit and GatorPlan will pick it up as it loads.";
  const button = document.getElementById("load-button");
  button.textContent = onAuditPage ? "Reload page" : "Go to degree audit";
  button.dataset.target = onAuditPage ? "reload" : "navigate";
  show("load");
}

function showReady(summary) {
  const list = document.getElementById("programs");
  list.replaceChildren(
    ...summary.programs.map((p) => {
      const li = document.createElement("li");
      const type = document.createElement("span");
      type.textContent = p.type;
      li.append(type, p.name);
      return li;
    }),
  );
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(summary.reportDate ?? "");
  document.getElementById("report-date").textContent = date
    ? `Report generated ${new Date(+date[1], +date[2] - 1, +date[3]).toLocaleDateString(undefined, { dateStyle: "medium" })}`
    : "";
  show("ready");
}

async function waitForAudit() {
  show("waiting");
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const status = await tabStatus();
    if (status?.ready) return showReady(status.summary);
  }
  await refresh();
  showError("The audit didn't load. Make sure you're logged in to ONE.UF, then try again.");
}

async function getAudit() {
  const res = await chrome.tabs.sendMessage(tab.id, { type: "oneuf:audit" }).catch(() => null);
  if (!res?.audit) throw new Error("The audit is no longer available. Reload the degree audit page and try again.");
  return res.audit;
}

const actions = {
  async agree() {
    await chrome.storage.local.set({ consentVersion: CONSENT_VERSION });
    await refresh();
  },
  decline() {
    window.close();
  },
  async withdraw() {
    await chrome.storage.local.remove("consentVersion");
    // Drop any audit already held by an open ONE.UF tab.
    if (tab && isOneUF(tab.url)) await chrome.tabs.reload(tab.id);
    show("consent");
  },
  privacy() {
    chrome.tabs.create({ url: `${GATORPLAN_URL}/privacy` });
  },
  async "open-audit"() {
    await chrome.tabs.create({ url: ONEUF_AUDIT_URL });
    window.close();
  },
  async load(button) {
    if (button.dataset.target === "reload") await chrome.tabs.reload(tab.id);
    else await chrome.tabs.update(tab.id, { url: ONEUF_AUDIT_URL });
    await waitForAudit();
  },
  async save() {
    const audit = await getAudit();
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "degree-audit.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  },
  async send(button) {
    button.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: "handoff:start", audit: await getAudit() });
      if (res?.error) throw new Error(res.error);
      window.close();
    } finally {
      button.disabled = false;
    }
  },
};

document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  event.preventDefault();
  showError(null);
  try {
    await actions[el.dataset.action]?.(el);
  } catch (err) {
    showError(err?.message ?? String(err));
  }
});

refresh();
