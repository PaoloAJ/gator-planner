"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { streamDegreePlan } from "@/lib/api";
import { IMPORT_FROM_EXTENSION, IMPORT_PARAM, requestExtensionAudit } from "@/lib/extension";
import { upcomingTerms } from "@/lib/terms";
import type { DegreePlan, PlanAnswer, PlanOptions, PlanQuestion } from "@/lib/types";
import { PlanPreferences } from "./PlanPreferences";
import { PlanQuestions } from "./PlanQuestions";
import { PlanRoadmap } from "./PlanRoadmap";
import styles from "./DegreePlanner.module.css";

interface Props {
  /** Terms with Schedule of Courses data; only these can open in the week planner. */
  availableTerms: Set<string>;
  onOpenTerm: (termCode: string, courseCodes: string[]) => void;
  onBack: () => void;
  /** Called when the page was opened by the extension, to bring this view forward. */
  onImport: () => void;
}

type Step = "audit" | "prefs" | "running" | "questions" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "audit", label: "Your audit" },
  { id: "prefs", label: "Your preferences" },
  { id: "questions", label: "A few questions" },
  { id: "done", label: "Your plan" },
];

function isAudit(data: unknown): boolean {
  const careers = (data as { careers?: unknown } | null)?.careers;
  return Array.isArray(careers) && careers.length > 0;
}

function defaultOptions(): PlanOptions {
  return {
    startTerm: upcomingTerms(1)[0],
    includeSummer: false,
    maxCredits: 16,
    minCredits: 12,
    maxSummerCredits: 9,
    awayTerms: [],
    pace: "balanced",
    interests: [],
    preferHighlyRated: true,
    mustTake: [],
    avoid: [],
    notes: "",
  };
}

export function DegreePlanner({ availableTerms, onOpenTerm, onBack, onImport }: Props) {
  const [step, setStep] = useState<Step>("audit");
  const [auditText, setAuditText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [audit, setAudit] = useState<unknown>(null);
  const [options, setOptions] = useState<PlanOptions>(defaultOptions);
  const [questions, setQuestions] = useState<PlanQuestion[]>([]);
  const [asked, setAsked] = useState(false);

  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<DegreePlan | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [imported, setImported] = useState(false);
  const importStarted = useRef(false);

  // Opened by the extension: take the audit it hands over and skip ahead.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (importStarted.current || url.searchParams.get(IMPORT_PARAM) !== IMPORT_FROM_EXTENSION) return;
    importStarted.current = true;
    url.searchParams.delete(IMPORT_PARAM);
    window.history.replaceState(null, "", url);
    onImport();
    requestExtensionAudit().then((data) => {
      if (!isAudit(data)) {
        setError(
          "GatorPlan didn't receive your audit from the extension. Click the extension's button on your ONE.UF degree audit again, or paste the audit below.",
        );
        return;
      }
      setAuditText(JSON.stringify(data, null, 2));
      setFileName(null);
      setAudit(data);
      setImported(true);
      setStep("prefs");
    });
  }, [onImport]);

  async function loadFile(file: File) {
    setFileName(file.name);
    setAuditText(await file.text());
  }

  function continueFromAudit() {
    setError(null);
    try {
      const parsed = JSON.parse(auditText);
      if (!isAudit(parsed)) throw new Error();
      setAudit(parsed);
      setStep("prefs");
    } catch {
      setError("That doesn't look like a degree audit. Paste the full response; it starts with {\"careers\".");
    }
  }

  async function build(extra: { answers?: PlanAnswer[]; skipQuestions?: boolean } = {}) {
    const ctl = new AbortController();
    abortRef.current = ctl;
    const returnTo: Step = extra.answers || extra.skipQuestions ? "questions" : "prefs";
    setError(null);
    setLog([]);
    setPlan(null);
    setStep("running");
    try {
      await streamDegreePlan(
        audit,
        { ...options, ...extra },
        (e) => {
          if (e.type === "status") setLog((l) => [...l, e.message]);
          else if (e.type === "questions") {
            setQuestions(e.questions);
            setAsked(true);
            setStep("questions");
          } else if (e.type === "plan") {
            setPlan(e.plan);
            setStep("done");
          } else if (e.type === "error") {
            setError(e.message);
            setStep(returnTo);
          }
        },
        ctl.signal,
      );
    } catch (e) {
      if (!ctl.signal.aborted) {
        setError((e as Error).message);
        setStep(returnTo);
      }
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setStep(asked ? "questions" : "prefs");
  }

  function startOver() {
    setStep("audit");
    setAudit(null);
    setAuditText("");
    setFileName(null);
    setImported(false);
    setPlan(null);
    setQuestions([]);
    setAsked(false);
    setLog([]);
    setError(null);
  }

  // Progress through the steps, for the sidebar.
  const order: Step[] = ["audit", "prefs", "questions", "done"];
  const current = step === "running" ? (asked ? "questions" : "prefs") : step;
  const currentIndex = order.indexOf(current);

  return (
    <div className={styles.layout}>
      <aside className={styles.side}>
        <button className={styles.back} onClick={onBack}>
          ← Week planner
        </button>
        <h1 className={styles.heading}>Plan my degree</h1>

        <ol className={styles.steps}>
          {STEPS.map((s, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
            const skipped = s.id === "questions" && !asked && currentIndex > i;
            return (
              <li key={s.id} data-state={state}>
                <span className={styles.stepDot}>{state === "done" ? "✓" : i + 1}</span>
                {s.label}
                {skipped && <span className={styles.stepNote}>not needed</span>}
              </li>
            );
          })}
        </ol>

        {log.length > 0 && (
          <ol className={styles.log} aria-live="polite">
            {log.map((line, i) => (
              <li key={i} data-current={(step === "running" && i === log.length - 1) || undefined}>
                {line}
              </li>
            ))}
          </ol>
        )}

        {plan && (
          <div className={styles.programs}>
            {plan.programs.map((p) => (
              <div key={p.code}>
                <span className={styles.programType}>{p.type.toUpperCase()}</span>
                {p.name}
              </div>
            ))}
          </div>
        )}

        <p className={styles.privacy}>
          Your audit goes to GatorPlan’s server and, with your name, UFID, and grades removed, to Anthropic’s Claude to
          build the plan. GatorPlan doesn’t store it. <Link href="/privacy">Privacy notice</Link>
        </p>
      </aside>

      <main className={styles.main}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {imported && step === "prefs" && (
          <p className={styles.notice} role="status">
            Loaded your degree audit from the GatorPlan extension, with your name, UFID, grades, and GPA removed.
          </p>
        )}

        {step === "audit" && (
          <section className={styles.panel}>
            <h2 className={styles.title}>Start with your degree audit</h2>
            <p className={styles.lede}>
              The planner reads your remaining major and minor requirements from your UF degree audit, then builds a
              semester-by-semester path checked against real prerequisites and course offerings.
            </p>
            <details className={styles.howto} open>
              <summary>How to get your audit</summary>
              <p>
                <strong>Easiest:</strong> install the GatorPlan Chrome extension, open your degree audit on ONE.UF, and
                click the extension’s button. It brings your audit here with your name, UFID, grades, and GPA removed.
              </p>
              <p>Or copy it yourself:</p>
              <ol>
                <li>Open your degree audit on ONE.UF.</li>
                <li>Open DevTools (⌥⌘I) → Network, then reload the page.</li>
                <li>
                  Find the request whose response starts with <code>{"{\"careers\""}</code>.
                </li>
                <li>Right-click it → Copy → Copy response, and paste below. Or save it as a .json file.</li>
              </ol>
            </details>
            <label className={styles.label} htmlFor="audit">
              Degree audit JSON
            </label>
            <textarea
              id="audit"
              className={styles.auditBox}
              placeholder='{"careers": [ … ] }'
              value={auditText}
              onChange={(e) => {
                setAuditText(e.target.value);
                setFileName(null);
              }}
              spellCheck={false}
            />
            <div className={styles.row}>
              <label className={styles.file}>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
                />
                {fileName ? `Loaded ${fileName}` : "Upload a .json file instead"}
              </label>
              <div className={styles.spacer} />
              <button className={styles.primary} disabled={!auditText.trim()} onClick={continueFromAudit}>
                Continue
              </button>
            </div>
          </section>
        )}

        {step === "prefs" && (
          <PlanPreferences
            options={options}
            onChange={setOptions}
            onBack={() => setStep("audit")}
            onSubmit={() => {
              setAsked(false);
              build();
            }}
          />
        )}

        {step === "running" && (
          <section className={styles.panel}>
            <h2 className={styles.title}>Building your plan…</h2>
            <p className={styles.lede}>
              The planner is looking up courses, checking prerequisites, and fitting everything to your preferences.
              This usually takes a minute or two.
            </p>
            <ol className={styles.bigLog}>
              {log.map((line, i) => (
                <li key={i} data-current={i === log.length - 1 || undefined}>
                  {line}
                </li>
              ))}
              {log.length === 0 && <li data-current>Starting…</li>}
            </ol>
            <div className={styles.row}>
              <button className={styles.secondary} onClick={cancel}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {step === "questions" && (
          <PlanQuestions
            questions={questions}
            onAnswer={(answers) => build({ answers })}
            onSkip={() => build({ skipQuestions: true })}
          />
        )}

        {step === "done" && plan && (
          <PlanRoadmap
            plan={plan}
            availableTerms={availableTerms}
            onOpenTerm={onOpenTerm}
            onAdjust={() => {
              setAsked(false);
              setStep("prefs");
            }}
            onStartOver={startOver}
          />
        )}
      </main>
    </div>
  );
}
