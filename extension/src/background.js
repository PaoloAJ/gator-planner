// Hands an audit from the popup to one GatorPlan tab. The audit waits in
// chrome.storage.session (memory only, cleared when Chrome closes) until the
// GatorPlan tab we opened takes it, which deletes it. Unclaimed audits expire.
importScripts("config.js");

const HANDOFF_KEY = "handoff";
const HANDOFF_TTL_MS = 10 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  switch (message?.type) {
    case "handoff:start":
      startHandoff(message.audit).then(sendResponse, (err) => sendResponse({ error: String(err?.message ?? err) }));
      return true;
    case "handoff:take":
      takeHandoff(sender).then(sendResponse, () => sendResponse({ audit: null }));
      return true;
  }
});

async function startHandoff(audit) {
  if (!audit || typeof audit !== "object") throw new Error("No audit to send.");
  const tab = await chrome.tabs.create({ url: `${GATORPLAN_URL}/?import=extension` });
  await chrome.storage.session.set({ [HANDOFF_KEY]: { audit, tabId: tab.id, createdAt: Date.now() } });
  return { ok: true };
}

async function takeHandoff(sender) {
  if (sender.origin !== new URL(GATORPLAN_URL).origin) return { audit: null };
  // The tab can load before startHandoff has saved the audit; wait briefly.
  let pending;
  for (let i = 0; i < 10 && !pending; i++) {
    ({ [HANDOFF_KEY]: pending } = await chrome.storage.session.get(HANDOFF_KEY));
    if (!pending) await new Promise((r) => setTimeout(r, 200));
  }
  if (!pending || pending.tabId !== sender.tab?.id) return { audit: null };
  await chrome.storage.session.remove(HANDOFF_KEY);
  if (Date.now() - pending.createdAt > HANDOFF_TTL_MS) return { audit: null };
  return { audit: pending.audit };
}

// Drop an unclaimed audit if its tab closes first.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [HANDOFF_KEY]: pending } = await chrome.storage.session.get(HANDOFF_KEY);
  if (pending?.tabId === tabId) await chrome.storage.session.remove(HANDOFF_KEY);
});
