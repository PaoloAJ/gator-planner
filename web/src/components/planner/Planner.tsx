"use client";

import { useRef, useState } from "react";
import { INITIAL_PLANS, SCRAPED_AT, STUDENT, TERMS, catalogForTerm } from "@/lib/mock-data";
import {
  averageRating,
  conflictsWith,
  findSection,
  rankSections,
  resolvePlan,
  totalCredits,
} from "@/lib/schedule";
import type { Course, PlannedCourse } from "@/lib/types";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { CourseList } from "./CourseList";
import { WeekGrid } from "./WeekGrid";
import { ProfessorRail } from "./ProfessorRail";
import styles from "./Planner.module.css";

interface Pending {
  courseCode: string;
  sectionId: string;
}

export function Planner() {
  const [plans, setPlans] = useState<Record<string, PlannedCourse[]>>(INITIAL_PLANS);
  const [termCode, setTermCode] = useState(TERMS[0].code);
  const [selectedCode, setSelectedCode] = useState<string | null>(
    INITIAL_PLANS[TERMS[0].code][0]?.courseCode ?? null,
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const term = TERMS.find((t) => t.code === termCode) ?? TERMS[0];
  const plan = plans[termCode] ?? [];
  const plannedEarlier = TERMS.slice(0, TERMS.indexOf(term)).flatMap((t) =>
    (plans[t.code] ?? []).map((p) => p.courseCode),
  );
  const entries = resolvePlan(plan);

  const selected = entries.find((e) => e.course.code === selectedCode) ?? null;
  const pendingSectionId =
    selected && pending?.courseCode === selected.course.code ? pending.sectionId : selected?.section.id;

  // The ghost on the week grid: whichever alternative the student is pointing
  // at or has picked in the rail, as long as it isn't what's already planned.
  const previewId = hoveredSectionId ?? pendingSectionId;
  const previewSection =
    selected && previewId && previewId !== selected.section.id ? findSection(selected.course, previewId) : undefined;

  const ranked = selected ? rankSections(selected.course) : [];
  const conflicts = selected
    ? new Map(ranked.map((s) => [s.id, conflictsWith(s, entries, selected.course.code)]))
    : new Map<string, string[]>();

  function selectTerm(code: string) {
    setTermCode(code);
    setSelectedCode(plans[code]?.[0]?.courseCode ?? null);
    setPending(null);
    setHoveredSectionId(null);
  }

  function selectCourse(code: string | null) {
    setSelectedCode(code);
    setPending(null);
    setHoveredSectionId(null);
  }

  function updatePlan(next: PlannedCourse[]) {
    setPlans((prev) => ({ ...prev, [termCode]: next }));
  }

  function swapToPending() {
    if (!selected || !pendingSectionId) return;
    updatePlan(
      plan.map((p) => (p.courseCode === selected.course.code ? { ...p, sectionId: pendingSectionId } : p)),
    );
    setPending(null);
  }

  function addCourse(course: Course) {
    if (!plan.some((p) => p.courseCode === course.code)) {
      // Default to the best-rated section that fits; fall back to the best-rated one.
      const ranked = rankSections(course);
      const fits = ranked.find((s) => conflictsWith(s, entries, course.code).length === 0);
      updatePlan([...plan, { courseCode: course.code, sectionId: (fits ?? ranked[0]).id }]);
    }
    selectCourse(course.code);
  }

  function removeCourse(code: string) {
    const next = plan.filter((p) => p.courseCode !== code);
    updatePlan(next);
    if (selectedCode === code) selectCourse(next[0]?.courseCode ?? null);
  }

  return (
    <div className={styles.app}>
      <TopBar
        terms={TERMS.map((t) => ({ ...t, credits: totalCredits(plans[t.code] ?? []) }))}
        activeTerm={termCode}
        onSelectTerm={selectTerm}
        catalog={catalogForTerm(termCode)}
        plannedCodes={new Set(plan.map((p) => p.courseCode))}
        onAddCourse={addCourse}
        searchRef={searchRef}
      />
      <StatusBar term={term} student={STUDENT} averageRating={averageRating(entries)} />
      <main className={styles.workspace}>
        <CourseList
          termLabel={term.label}
          credits={totalCredits(plan)}
          entries={entries}
          selectedCode={selectedCode}
          onSelect={selectCourse}
          onRemove={removeCourse}
          onAdd={() => searchRef.current?.focus()}
        />
        <WeekGrid
          entries={entries}
          selectedCode={selectedCode}
          preview={selected && previewSection ? { course: selected.course, section: previewSection } : null}
          onSelect={selectCourse}
        />
        <ProfessorRail
          course={selected?.course ?? null}
          sections={ranked}
          currentId={selected?.section.id ?? null}
          pendingId={pendingSectionId ?? null}
          conflicts={conflicts}
          completed={STUDENT.completed}
          plannedEarlier={plannedEarlier}
          scrapedAt={SCRAPED_AT}
          onPick={(sectionId) => selected && setPending({ courseCode: selected.course.code, sectionId })}
          onHover={setHoveredSectionId}
          onSwap={swapToPending}
        />
      </main>
    </div>
  );
}
