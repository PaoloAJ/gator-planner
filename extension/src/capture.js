// Runs in the ONE.UF page itself (MAIN world) so it can see the degree audit
// the page already downloads. Only responses from a ".../loaddegreeaudit/"
// request are read; every other request passes through untouched. The audit
// is handed to oneuf.js in the same tab and goes nowhere else from here.
(() => {
  const AUDIT_PATH = /\/loaddegreeaudit\/?$/i;
  const EVENT = "gatorplan:audit-captured";

  function isAuditURL(url) {
    try {
      return AUDIT_PATH.test(new URL(url, location.href).pathname);
    } catch {
      return false;
    }
  }

  function report(text) {
    if (typeof text === "string" && text.length > 0) {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: text }));
    }
  }

  const fetch = window.fetch;
  window.fetch = function (input, init) {
    const result = fetch.apply(this, arguments);
    const url = input instanceof Request ? input.url : String(input);
    if (isAuditURL(url)) {
      result
        .then((res) => (res.ok ? res.clone().text() : null))
        .then(report)
        .catch(() => {});
    }
    return result;
  };

  const auditRequests = new WeakSet();
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    if (isAuditURL(String(url))) auditRequests.add(this);
    else auditRequests.delete(this);
    return open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (auditRequests.has(this)) {
      this.addEventListener("load", () => {
        if (this.status < 200 || this.status >= 300) return;
        if (this.responseType === "" || this.responseType === "text") report(this.responseText);
        else if (this.responseType === "json") report(JSON.stringify(this.response));
      });
    }
    return send.apply(this, arguments);
  };
})();
