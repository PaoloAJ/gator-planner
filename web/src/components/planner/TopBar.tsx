import type { RefObject } from "react";
import type { Term } from "@/lib/types";
import { CourseSearch } from "./CourseSearch";
import styles from "./TopBar.module.css";

interface Props {
  terms: (Term & { credits: number })[];
  activeTerm: string | null;
  onSelectTerm: (code: string) => void;
  plannedCodes: Set<string>;
  onAddCourse: (code: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

export function TopBar({ terms, activeTerm, onSelectTerm, plannedCodes, onAddCourse, searchRef }: Props) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden>
          G
        </span>
        <span className={styles.name}>GatorPlan</span>
      </div>

      <nav className={styles.tabs} role="tablist" aria-label="Semesters">
        {terms.map((t) => {
          const active = t.code === activeTerm;
          return (
            <button
              key={t.code}
              role="tab"
              aria-selected={active}
              className={styles.tab}
              data-active={active || undefined}
              onClick={() => onSelectTerm(t.code)}
            >
              <span className={styles.tabName}>{t.label}</span>
              <span className={styles.tabCredits}>{t.credits} cr</span>
            </button>
          );
        })}
        <button className={styles.addTab} aria-disabled title="Add a semester (coming soon)">
          +
        </button>
      </nav>

      <div className={styles.spacer} />

      <div className={styles.tools}>
        <CourseSearch termCode={activeTerm} plannedCodes={plannedCodes} onAdd={onAddCourse} inputRef={searchRef} />
        <span className={styles.avatar} aria-label="Account" role="img" />
      </div>
    </header>
  );
}
