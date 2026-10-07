"use client";

import { useState } from "react";
import { planningWindow, termLabel, upcomingTerms } from "@/lib/terms";
import type { Pace, PlanOptions } from "@/lib/types";
import styles from "./DegreePlanner.module.css";

// Same limits the server enforces (planner.Options.Check).
const MAX_NOTES = 1000;
const MAX_INTERESTS = 8;
const MAX_INTEREST_LEN = 40;
const MAX_CODES = 10;
const MAX_AWAY = 6;
const COURSE_CODE = /^[A-Z]{3}[0-9]{4}[A-Z]?$/;

const PACES: { id: Pace; label: string; detail: string }[] = [
  { id: "balanced", label: "Balanced", detail: "Mix harder and easier courses every term." },
  { id: "front-load", label: "Get hard courses done early", detail: "Tackle the toughest requirements first." },
  { id: "steady", label: "Keep every term manageable", detail: "Never stack difficult courses together." },
];

const SUGGESTED_INTERESTS = [
  "AI & machine learning",
  "Cybersecurity",
  "Data science",
  "Software engineering",
  "Systems & networks",
  "Research / grad school",
  "Entrepreneurship",
  "Design & UX",
];

interface Props {
  options: PlanOptions;
  onChange: (o: PlanOptions) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function PlanPreferences({ options: o, onChange, onBack, onSubmit }: Props) {
  const set = (patch: Partial<PlanOptions>) => onChange({ ...o, ...patch });

  const starts = upcomingTerms(4);
  // Graduation targets: fall/spring terms from the start, up to six years out.
  const targets = planningWindow(o.startTerm, false, undefined, 12);
  const window = planningWindow(o.startTerm, o.includeSummer, o.targetTerm, 8);

  function setStart(start: string) {
    const target = o.targetTerm && o.targetTerm < start ? undefined : o.targetTerm;
    set({ startTerm: start, targetTerm: target, awayTerms: o.awayTerms.filter((a) => a >= start) });
  }

  function toggleAway(code: string) {
    const away = o.awayTerms.includes(code) ? o.awayTerms.filter((a) => a !== code) : [...o.awayTerms, code];
    if (away.length <= MAX_AWAY) set({ awayTerms: away.sort() });
  }

  const notesLeft = MAX_NOTES - o.notes.length;
  // Away terms must stay inside the window when it shrinks.
  const awayOutside = o.awayTerms.filter((a) => !window.includes(a));
  const canSubmit = o.minCredits <= o.maxCredits && awayOutside.length === 0 && notesLeft >= 0;

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Tell us how you want to finish</h2>
      <p className={styles.lede}>
        These shape the plan. Rules like prerequisites and credit limits are always enforced; everything else is your
        call.
      </p>

      <fieldset className={styles.group}>
        <legend>Timeline</legend>
        <div className={styles.fields}>
          <label className={styles.field}>
            Start planning from
            <select value={o.startTerm} onChange={(e) => setStart(e.target.value)}>
              {starts.map((c) => (
                <option key={c} value={c}>
                  {termLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Graduate by
            <select
              value={o.targetTerm ?? ""}
              onChange={(e) => set({ targetTerm: e.target.value || undefined })}
            >
              <option value="">As soon as possible</option>
              {targets.map((c) => (
                <option key={c} value={c}>
                  {termLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={o.includeSummer}
              onChange={(e) => set({ includeSummer: e.target.checked, awayTerms: e.target.checked ? o.awayTerms : o.awayTerms.filter((a) => a[3] !== "5") })}
            />
            Take summer classes
          </label>
          {o.includeSummer && (
            <label className={styles.field}>
              Max summer credits
              <select value={o.maxSummerCredits} onChange={(e) => set({ maxSummerCredits: Number(e.target.value) })}>
                {[3, 6, 7, 9, 12].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className={styles.subLabel}>Terms you’ll be away (co-op, internship, study abroad)</div>
        <div className={styles.chips}>
          {window.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.chip}
              aria-pressed={o.awayTerms.includes(c)}
              onClick={() => toggleAway(c)}
            >
              {termLabel(c)}
            </button>
          ))}
        </div>
        {awayOutside.length > 0 && (
          <p className={styles.fieldError}>
            {awayOutside.map(termLabel).join(", ")} is outside your timeline now.{" "}
            <button type="button" className={styles.linkButton} onClick={() => set({ awayTerms: o.awayTerms.filter((a) => window.includes(a)) })}>
              Remove
            </button>
          </p>
        )}
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Course load</legend>
        <div className={styles.fields}>
          <label className={styles.field}>
            Min credits per fall/spring
            <select value={o.minCredits} onChange={(e) => set({ minCredits: Number(e.target.value) })}>
              {[6, 9, 12, 13, 14, 15].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Max credits per fall/spring
            <select value={o.maxCredits} onChange={(e) => set({ maxCredits: Number(e.target.value) })}>
              {[12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        {o.minCredits > o.maxCredits && <p className={styles.fieldError}>Min credits can’t be more than max.</p>}

        <div className={styles.subLabel}>How should hard courses be spread out?</div>
        <div className={styles.paces} role="radiogroup">
          {PACES.map((p) => (
            <label key={p.id} className={styles.paceCard} data-selected={o.pace === p.id || undefined}>
              <input type="radio" name="pace" checked={o.pace === p.id} onChange={() => set({ pace: p.id })} />
              <b>{p.label}</b>
              <span>{p.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Interests and courses</legend>
        <div className={styles.subLabel}>What do you want your electives to focus on?</div>
        <TagInput
          values={o.interests}
          onChange={(interests) => set({ interests })}
          max={MAX_INTERESTS}
          placeholder="Type an interest and press Enter"
          validate={(v) => (v.length > MAX_INTEREST_LEN ? `Keep it under ${MAX_INTEREST_LEN} characters.` : null)}
          suggestions={SUGGESTED_INTERESTS}
        />

        <div className={styles.fields}>
          <div className={styles.field}>
            Courses you want to take
            <TagInput
              values={o.mustTake}
              onChange={(mustTake) => set({ mustTake })}
              max={MAX_CODES}
              placeholder="e.g. CAP4630"
              normalize={normalizeCode}
              validate={(v) =>
                !COURSE_CODE.test(v) ? "Use a course code like CAP4630." : o.avoid.includes(v) ? "That’s in your avoid list." : null
              }
            />
          </div>
          <div className={styles.field}>
            Courses to avoid
            <TagInput
              values={o.avoid}
              onChange={(avoid) => set({ avoid })}
              max={MAX_CODES}
              placeholder="e.g. STA3032"
              normalize={normalizeCode}
              validate={(v) =>
                !COURSE_CODE.test(v) ? "Use a course code like STA3032." : o.mustTake.includes(v) ? "That’s in your take list." : null
              }
            />
          </div>
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={o.preferHighlyRated}
            onChange={(e) => set({ preferHighlyRated: e.target.checked })}
          />
          When choices are otherwise equal, prefer courses with highly rated professors
        </label>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Anything else?</legend>
        <textarea
          className={styles.notes}
          value={o.notes}
          maxLength={MAX_NOTES}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="e.g. “I want a light final semester for job hunting.” “I’d rather do statistics before physics.” “I’m considering a CS master’s.”"
          aria-describedby="notes-help"
        />
        <div className={styles.notesFoot} id="notes-help">
          <span>
            Treated as preferences: anything that conflicts with degree rules or isn’t about planning is set aside, and the
            plan says so. Emails and ID numbers are removed automatically.
          </span>
          <span className={styles.counter} data-low={notesLeft < 100 || undefined}>
            {notesLeft}
          </span>
        </div>
      </fieldset>

      <div className={styles.row}>
        <button className={styles.secondary} onClick={onBack}>
          Back
        </button>
        <div className={styles.spacer} />
        <button className={styles.primary} disabled={!canSubmit} onClick={onSubmit}>
          Build my plan
        </button>
      </div>
    </section>
  );
}

function normalizeCode(v: string): string {
  return v.toUpperCase().replace(/\s+/g, "");
}

interface TagInputProps {
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  placeholder: string;
  validate: (v: string) => string | null;
  normalize?: (v: string) => string;
  suggestions?: string[];
}

function TagInput({ values, onChange, max, placeholder, validate, normalize = (v) => v.trim(), suggestions }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(raw: string) {
    const v = normalize(raw);
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    if (values.length >= max) return setError(`Up to ${max}.`);
    const problem = validate(v);
    if (problem) return setError(problem);
    onChange([...values, v]);
    setDraft("");
    setError(null);
  }

  return (
    <div className={styles.tagInput}>
      <div className={styles.chips}>
        {values.map((v) => (
          <span key={v} className={styles.tag}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={values.length < max ? placeholder : ""}
          disabled={values.length >= max}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {error && <p className={styles.fieldError}>{error}</p>}
      {suggestions && (
        <div className={styles.suggestions}>
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <button key={s} type="button" className={styles.suggestion} onClick={() => add(s)} disabled={values.length >= max}>
                + {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
