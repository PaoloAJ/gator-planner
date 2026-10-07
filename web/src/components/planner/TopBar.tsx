"use client";

import { useState, type RefObject } from "react";
import { academicYear, academicYearTerms, termLabel } from "@/lib/terms";
import type { Term } from "@/lib/types";
import { CourseSearch } from "./CourseSearch";
import styles from "./TopBar.module.css";

interface Props {
  terms: (Term & { credits: number })[];
  activeTerm: string | null;
  onSelectTerm: (code: string) => void;
  /** Fall of the student's freshman year, e.g. 2025 for 2025–26. */
  entryYear: number | null;
  onEntryYearChange: (year: number) => void;
  plannedCodes: Set<string>;
  onAddCourse: (code: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

const YEAR_NAMES = ["Freshman", "Sophomore", "Junior", "Senior"];
/** Years shown past senior, for students finishing later. */
const MAX_YEARS = 6;

export function TopBar({
  terms,
  activeTerm,
  onSelectTerm,
  entryYear,
  onEntryYearChange,
  plannedCodes,
  onAddCourse,
  searchRef,
}: Props) {
  // A year opened by hand stays open only until the active term changes.
  const [opened, setOpened] = useState<{ year: number; forTerm: string | null } | null>(null);

  const byCode = new Map(terms.map((t) => [t.code, t]));
  const activeYear = activeTerm ? academicYear(activeTerm) : null;
  const openYear = opened && opened.forTerm === activeTerm ? opened.year : activeYear;

  const suggested = terms.find((t) => t.suggested) ?? terms.at(-1);
  const newest = suggested ? academicYear(suggested.code) : null;
  const years =
    entryYear == null
      ? []
      : Array.from(
          {
            length: Math.min(
              MAX_YEARS,
              Math.max(YEAR_NAMES.length, ...terms.map((t) => academicYear(t.code) - entryYear + 1)),
            ),
          },
          (_, i) => entryYear + i,
        );
  const entryChoices =
    newest == null ? [] : [...new Set([...Array.from({ length: 6 }, (_, i) => newest - 5 + i), entryYear ?? newest])].sort();

  function chooseYear(year: number) {
    const available = academicYearTerms(year).filter((c) => byCode.has(c));
    const pick =
      available.find((c) => c === activeTerm) ??
      available.find((c) => byCode.get(c)!.credits > 0) ??
      available.find((c) => byCode.get(c)!.suggested) ??
      available[0];
    if (pick) {
      setOpened(null);
      onSelectTerm(pick);
    } else {
      setOpened({ year, forTerm: activeTerm });
    }
  }

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden>
          G
        </span>
        <span className={styles.name}>GatorPlan</span>
      </div>

      <nav className={styles.tabs} aria-label="Years and semesters">
        {years.map((year, i) => {
          const open = year === openYear;
          const sems = academicYearTerms(year);
          const credits = sems.reduce((sum, c) => sum + (byCode.get(c)?.credits ?? 0), 0);
          return (
            <div key={year} className={styles.year} data-open={open || undefined}>
              <button
                className={styles.yearTab}
                aria-expanded={open}
                data-current={year === activeYear || undefined}
                onClick={() => chooseYear(year)}
              >
                <span className={styles.tabName}>{YEAR_NAMES[i] ?? `Year ${i + 1}`}</span>
                <span className={styles.tabCredits}>
                  {year}–{String((year + 1) % 100).padStart(2, "0")}
                  {credits > 0 && ` · ${credits} cr`}
                </span>
              </button>
              {open && (
                <div className={styles.semesters} role="tablist" aria-label={`${YEAR_NAMES[i] ?? `Year ${i + 1}`} semesters`}>
                  {sems.map((code) => {
                    const term = byCode.get(code);
                    const active = code === activeTerm;
                    return (
                      <button
                        key={code}
                        role="tab"
                        aria-selected={active}
                        className={styles.tab}
                        data-active={active || undefined}
                        disabled={!term}
                        title={term ? undefined : "Schedule not published yet"}
                        onClick={() => onSelectTerm(code)}
                      >
                        <span className={styles.tabName}>{termLabel(code).split(" ")[0]}</span>
                        <span className={styles.tabCredits}>{term ? `${term.credits} cr` : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {entryYear != null && (
          <label className={styles.entry}>
            <span>Started</span>
            <select value={entryYear} onChange={(e) => onEntryYearChange(Number(e.target.value))}>
              {entryChoices.map((y) => (
                <option key={y} value={y}>
                  Fall {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </nav>

      <div className={styles.spacer} />

      <div className={styles.tools}>
        <CourseSearch
          termCode={activeTerm}
          plannedCodes={plannedCodes}
          onAdd={onAddCourse}
          inputRef={searchRef}
        />
        <span className={styles.avatar} aria-label="Account" role="img" />
      </div>
    </header>
  );
}
