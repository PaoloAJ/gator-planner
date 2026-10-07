// Strips personal data from a degree audit before it leaves ONE.UF's tab.
// GatorPlan plans from requirements and course history only (see
// server/internal/audit), so none of these fields are needed downstream.
//
// Loaded as a classic content script; test/redact.test.mjs loads it in Node.

/** Keys removed anywhere in the audit, compared case-insensitively. */
const REDACTED_KEYS = /^(name|ufid|emplid|studentid|email|grade|gradepoints?|.*gpa.*)$/i;

function redactAudit(value) {
  if (Array.isArray(value)) return value.map(redactAudit);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (!REDACTED_KEYS.test(key)) out[key] = redactAudit(v);
  }
  return out;
}

/** True when data has the shape of ONE.UF's degree audit response. */
function isDegreeAudit(data) {
  return (
    data !== null &&
    typeof data === "object" &&
    Array.isArray(data.careers) &&
    data.careers.length > 0 &&
    data.careers.every((c) => c && typeof c === "object" && Array.isArray(c.planGroups))
  );
}

/** What the popup shows to confirm the right audit was found. */
function summarizeAudit(audit) {
  const programs = [];
  let reportDate = null;
  for (const career of audit.careers) {
    reportDate ??= typeof career.reportDateTime === "string" ? career.reportDateTime : null;
    for (const program of career.programs ?? []) {
      for (const plan of program.plans ?? []) {
        const name = String(plan.planDescription ?? "").trim();
        if (name) programs.push({ type: String(plan.planTypeDescription ?? "").trim(), name });
      }
    }
  }
  return { programs, reportDate };
}
