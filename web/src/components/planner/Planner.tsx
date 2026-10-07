"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCourse, fetchTerms } from "@/lib/api";
import {
  averageRating,
  bestSection,
  conflictsWith,
  findSection,
  freeColor,
  rankSections,
  resolvePlan,
  totalCredits,
} from "@/lib/schedule";
import { academicYear } from "@/lib/terms";
import type { Course, PlannedCourse, Term } from "@/lib/types";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { CourseList, type ListStatus } from "./CourseList";
import { WeekGrid } from "./WeekGrid";
import { ProfessorRail } from "./ProfessorRail";
import { CourseSpotlight } from "./CourseSpotlight";
import { DegreePlanner } from "./DegreePlanner";
import styles from "./Planner.module.css";

interface Pending {
  courseCode: string;
  classNumber: number;
}

const ENTRY_YEAR_KEY = "gatorplan.entryYear";

function storedEntryYear(): number | null {
  try {
    const v = Number(localStorage.getItem(ENTRY_YEAR_KEY));
    return Number.isInteger(v) && v > 2000 ? v : null;
  } catch {
    return null;
  }
}

export function Planner() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [termCode, setTermCode] = useState<string | null>(null);
  const [entryYear, setEntryYear] = useState<number | null>(null);

  // Every session starts with an empty plan.
  const [plans, setPlans] = useState<Record<string, PlannedCourse[]>>({});
  // Course details fetched so far, per term. The ref mirrors state so a batch
  // of adds (opening a degree-plan term) sees courses added moments earlier.
  const [courses, setCourses] = useState<Record<string, Record<string, Course>>>({});
  const coursesRef = useRef(courses);
  const [view, setView] = useState<"week" | "degree">("week");
  const showDegreeView = useCallback(() => setView("degree"), []);
  const [listStatus, setListStatus] = useState<ListStatus | null>(null);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [hoveredClass, setHoveredClass] = useState<number | null>(null);
  // The add-course dialog; swapFor names the planned course a pick replaces.
  const [spotlight, setSpotlight] = useState<{ swapFor: string | null } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetchTerms(ctl.signal)
      .then((ts) => {
        setTerms(ts);
        setLoadError(null);
        const suggested = (ts.find((t) => t.suggested) ?? ts.at(-1))?.code ?? null;
        setTermCode(suggested);
        // Until the student says otherwise, assume the suggested term is in their first year.
        setEntryYear(storedEntryYear() ?? (suggested ? academicYear(suggested) : null));
      })
      .catch((e: Error) => {
        if (!ctl.signal.aborted) setLoadError(e.message);
      });
    return () => ctl.abort();
  }, [reloadKey]);

  // ⌘K / Ctrl+K opens the add-course dialog from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSpotlight((s) => s ?? { swapFor: null });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = terms?.find((t) => t.code === termCode) ?? null;
  const plan = (termCode && plans[termCode]) || [];
  const termCourses = (termCode && courses[termCode]) || {};
  const entries = resolvePlan(plan, termCourses);

  const selected = entries.find((e) => e.course.code === selectedCode) ?? null;
  const pendingClass =
    selected && pending?.courseCode === selected.course.code ? pending.classNumber : selected?.section.classNumber;

  // The ghost on the week grid: whichever alternative the student is pointing
  // at or has picked in the rail, as long as it isn't what's already planned.
  const previewClass = hoveredClass ?? pendingClass;
  const previewSection =
    selected && previewClass != null && previewClass !== selected.section.classNumber
      ? findSection(selected.course, previewClass)
      : undefined;
  const preview = selected && previewSection ? { ...selected, section: previewSection } : null;

  const ranked = selected ? rankSections(selected.course) : [];
  const conflicts = selected
    ? new Map(ranked.map((s) => [s.classNumber, conflictsWith(s, entries, selected.course.code)]))
    : new Map<number, string[]>();

  function selectTerm(code: string) {
    setView("week");
    setTermCode(code);
    setSelectedCode(plans[code]?.[0]?.courseCode ?? null);
    setPending(null);
    setHoveredClass(null);
    setListStatus(null);
    setSpotlight(null);
  }

  function changeEntryYear(year: number) {
    setEntryYear(year);
    try {
      localStorage.setItem(ENTRY_YEAR_KEY, String(year));
    } catch {
      // Private mode or storage blocked: the choice lasts for this visit only.
    }
  }

  function selectCourse(code: string | null) {
    setSelectedCode(code);
    setPending(null);
    setHoveredClass(null);
  }

  function swapToPending() {
    if (!termCode || !selected || pendingClass == null) return;
    const code = selected.course.code;
    setPlans((prev) => ({
      ...prev,
      [termCode]: (prev[termCode] ?? []).map((p) => (p.courseCode === code ? { ...p, classNumber: pendingClass } : p)),
    }));
    setPending(null);
  }

  /** Fetches (or reuses) a course for term `t`; null, with a status shown, if it can't be planned. */
  async function loadCourse(t: string, code: string, busy: string): Promise<Course | null> {
    setListStatus({ kind: "busy", text: busy });
    let course: Course;
    try {
      course = coursesRef.current[t]?.[code] ?? (await fetchCourse(t, code));
    } catch (e) {
      setListStatus({ kind: "error", text: `Couldn't load ${code}: ${(e as Error).message}` });
      return null;
    }
    if (course.sections.length === 0) {
      setListStatus({ kind: "error", text: `${code} has no sections this term.` });
      return null;
    }
    coursesRef.current = { ...coursesRef.current, [t]: { ...coursesRef.current[t], [code]: course } };
    setCourses(coursesRef.current);
    setListStatus(null);
    return course;
  }

  /** Adds a course to a term's plan; returns false if it couldn't be added. */
  async function addCourse(code: string, target?: string): Promise<boolean> {
    const t = target ?? termCode;
    if (!t) return false;
    if (!target && plan.some((p) => p.courseCode === code)) {
      selectCourse(code);
      return true;
    }

    const course = await loadCourse(t, code, `Adding ${code}…`);
    if (!course) return false;
    const known = coursesRef.current[t];
    setPlans((prev) => {
      const current = prev[t] ?? [];
      if (current.some((p) => p.courseCode === code)) return prev;
      const section = bestSection(course, resolvePlan(current, known));
      return { ...prev, [t]: [...current, { courseCode: code, classNumber: section.classNumber, color: freeColor(current) }] };
    });
    selectCourse(code);
    return true;
  }

  function startSwap(code: string) {
    selectCourse(code);
    setSpotlight({ swapFor: code });
  }

  /** Replaces a planned course with another, keeping its place and color. */
  async function swapCourse(oldCode: string, newCode: string) {
    const t = termCode;
    if (!t) return;
    if (plan.some((p) => p.courseCode === newCode)) {
      setListStatus({ kind: "error", text: `${newCode} is already in your plan.` });
      return;
    }

    const course = await loadCourse(t, newCode, `Swapping ${oldCode} for ${newCode}…`);
    if (!course) return;
    const known = coursesRef.current[t];
    setPlans((prev) => {
      const current = prev[t] ?? [];
      const others = resolvePlan(
        current.filter((p) => p.courseCode !== oldCode),
        known,
      );
      const section = bestSection(course, others);
      return {
        ...prev,
        [t]: current.map((p) =>
          p.courseCode === oldCode ? { courseCode: newCode, classNumber: section.classNumber, color: p.color } : p,
        ),
      };
    });
    selectCourse(newCode);
  }

  // Loads one term of a degree plan into the week planner.
  async function openPlanTerm(t: string, codes: string[]) {
    selectTerm(t);
    const failed: string[] = [];
    for (const code of codes) {
      if (!(await addCourse(code, t))) failed.push(code);
    }
    if (failed.length) {
      setListStatus({ kind: "error", text: `Not offered this term: ${failed.join(", ")}` });
    }
    selectCourse(codes.find((c) => !failed.includes(c)) ?? null);
  }

  function removeCourse(code: string) {
    if (!termCode) return;
    const next = plan.filter((p) => p.courseCode !== code);
    setPlans((prev) => ({ ...prev, [termCode]: next }));
    if (selectedCode === code) selectCourse(next[0]?.courseCode ?? null);
  }

  const tabs = (terms ?? []).map((t) => ({
    ...t,
    credits: totalCredits(resolvePlan(plans[t.code] ?? [], courses[t.code] ?? {})),
  }));

  return (
    <div className={styles.app}>
      <TopBar
        terms={tabs}
        activeTerm={termCode}
        onSelectTerm={selectTerm}
        entryYear={entryYear}
        onEntryYearChange={changeEntryYear}
        plannedCodes={new Set(plan.map((p) => p.courseCode))}
        onAddCourse={addCourse}
        searchRef={searchRef}
      />

      {terms && terms.length > 0 && (
        <div className={styles.degreeView} hidden={view !== "degree"}>
          <DegreePlanner
            availableTerms={new Set(terms.map((t) => t.code))}
            onOpenTerm={openPlanTerm}
            onBack={() => setView("week")}
            onImport={showDegreeView}
          />
        </div>
      )}

      {view === "degree" ? null : term ? (
        <>
          <StatusBar
            term={term}
            courseCount={entries.length}
            credits={totalCredits(entries)}
            averageRating={averageRating(entries)}
            onPlanDegree={() => setView("degree")}
          />
          <main className={styles.workspace}>
            <CourseList
              termLabel={term.label}
              credits={totalCredits(entries)}
              entries={entries}
              selectedCode={selectedCode}
              status={listStatus}
              onSelect={selectCourse}
              onRemove={removeCourse}
              onSwap={startSwap}
              onAdd={() => setSpotlight({ swapFor: null })}
            />
            <WeekGrid
              termCode={term.code}
              entries={entries}
              selectedCode={selectedCode}
              preview={preview}
              emptyHint={`Press ⌘K or + Add course to start your ${term.label} schedule.`}
              onSelect={selectCourse}
            />
            <ProfessorRail
              termCode={term.code}
              course={selected?.course ?? null}
              color={selected?.color ?? 0}
              sections={ranked}
              currentClass={selected?.section.classNumber ?? null}
              pendingClass={pendingClass ?? null}
              conflicts={conflicts}
              timesScrapedAt={term.timesScrapedAt}
              onPick={(classNumber) => selected && setPending({ courseCode: selected.course.code, classNumber })}
              onHover={setHoveredClass}
              onSwap={swapToPending}
            />
          </main>
          {spotlight && (
            <CourseSpotlight
              termCode={term.code}
              termLabel={term.label}
              plannedCodes={new Set(plan.map((p) => p.courseCode))}
              swapFor={spotlight.swapFor}
              onChoose={(code) => (spotlight.swapFor ? swapCourse(spotlight.swapFor, code) : addCourse(code))}
              onClose={() => setSpotlight(null)}
            />
          )}
        </>
      ) : (
        <main className={styles.message}>
          {loadError ? (
            <>
              <p>
                <b>Couldn’t reach the GatorPlan API.</b> {loadError}
              </p>
              <p className={styles.hint}>Start it with <code>go run ./cmd/api</code> in <code>server/</code>.</p>
              <button className={styles.retry} onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </button>
            </>
          ) : terms && terms.length === 0 ? (
            <>
              <p>
                <b>No terms loaded yet.</b>
              </p>
              <p className={styles.hint}>
                Run <code>go run ./cmd/ingest</code> in <code>server/</code> to scrape the Schedule of Courses.
              </p>
            </>
          ) : (
            <p className={styles.hint}>Loading the catalog…</p>
          )}
        </main>
      )}
    </div>
  );
}
