// node --test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../src/redact.js", import.meta.url), "utf8"), context);
const { isDegreeAudit } = context;
// Values built inside the vm have their own prototypes; compare them as JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));
const redactAudit = (a) => plain(context.redactAudit(a));
const summarizeAudit = (a) => plain(context.summarizeAudit(a));

const sample = JSON.parse(
  readFileSync(new URL("../../server/internal/audit/testdata/sample_audit.json", import.meta.url), "utf8"),
);

function keys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keys(v, out);
    }
  }
  return out;
}

test("removes name, UFID, grades, and GPA at any depth", () => {
  const audit = { careers: [{ name: "A", ufid: 1, EMPLID: "2", planGroups: [[{ gpaActual: 3.9, termGPA: 3, coursesTaken: [{ grade: "A", gradePoints: 4 }] }]] }] };
  assert.deepEqual(redactAudit(audit), { careers: [{ planGroups: [[{ coursesTaken: [{}] }]] }] });
});

test("keeps every field the GatorPlan server parses", () => {
  const before = keys(sample);
  const after = keys(redactAudit(sample));
  for (const k of ["name", "ufid", "grade", "gpaActual"]) assert.ok(before.has(k) && !after.has(k), k);
  // From rawAudit/node/taken in server/internal/audit/audit.go.
  for (const k of [
    "careers", "careerCode", "programs", "plans", "plan", "planTypeDescription", "planDescription", "catalogYear",
    "planGroups", "status", "met", "inProgress", "title", "description", "unitsNeeded", "courseNeeded",
    "academicPlan", "coursesTaken", "coursesAvailable", "requirements", "subRequirements", "termDescription",
    "courseName", "courseType", "credit", "subject", "catalogNumber",
  ]) {
    if (before.has(k)) assert.ok(after.has(k), k);
  }
});

test("does not modify its input", () => {
  const copy = structuredClone(sample);
  redactAudit(sample);
  assert.deepEqual(sample, copy);
});

test("recognizes degree audits", () => {
  assert.equal(isDegreeAudit(sample), true);
  for (const bad of [null, [], {}, { careers: [] }, { careers: [{}] }, "x"]) assert.equal(isDegreeAudit(bad), false);
});

test("summarizes programs", () => {
  const s = summarizeAudit(redactAudit(sample));
  assert.deepEqual(s.programs, [
    { type: "Major", name: "Computer Science" },
    { type: "Minor", name: "Engineering Innovation" },
  ]);
});
