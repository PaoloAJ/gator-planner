"use client";

import { useEffect, useId, useRef } from "react";
import { formatRating, ratingTone } from "@/lib/schedule";
import type { SearchResult } from "@/lib/types";
import { useCourseSearch } from "./useCourseSearch";
import styles from "./CourseSpotlight.module.css";

interface Props {
  termCode: string;
  termLabel: string;
  plannedCodes: Set<string>;
  /** The planned course a pick will replace; null to add instead. */
  swapFor: string | null;
  onChoose: (code: string) => void;
  onClose: () => void;
}

/** A centered search dialog for adding or swapping a course, opened from the course list or ⌘K. */
export function CourseSpotlight({ termCode, termLabel, plannedCodes, swapFor, onChoose, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const search = useCourseSearch(termCode);
  const { q, current, results, active } = search;
  const listId = useId();

  // Mounted only while open; showModal gives the focus trap, Escape, and backdrop.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function choose(r: SearchResult) {
    onChoose(r.code);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (search.moveActive(e.key)) {
      e.preventDefault();
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      choose(results[active]);
    }
  }

  const action = (r: SearchResult) => (plannedCodes.has(r.code) ? "In plan" : swapFor ? "Swap in" : "Add");

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={swapFor ? `Swap ${swapFor}` : `Add a course to ${termLabel}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the backdrop lands on the dialog itself.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.box}>
        <div className={styles.field}>
          <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            className={styles.input}
            type="search"
            autoFocus
            placeholder={swapFor ? `Swap ${swapFor} for…` : `Add a course to ${termLabel}…`}
            aria-label={swapFor ? `Search for a course to replace ${swapFor}` : "Search courses or professors"}
            role="combobox"
            aria-expanded={q !== ""}
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {swapFor && <span className={styles.mode}>Swapping {swapFor}</span>}
        </div>

        {q !== "" && (
          <ul id={listId} role="listbox" className={styles.list} aria-busy={!current}>
            {!current && <li className={styles.empty}>Searching…</li>}
            {current?.error && <li className={styles.empty}>Search failed: {current.error}</li>}
            {current && !current.error && results.length === 0 && (
              <li className={styles.empty}>No courses match “{q}”</li>
            )}
            {results.map((r, i) => (
              <li
                key={r.code}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                data-active={i === active || undefined}
                onClick={() => choose(r)}
                onMouseEnter={() => search.setActive(i)}
              >
                <span className={styles.code}>{r.code}</span>
                <span className={styles.body}>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.meta}>
                    {r.credits} cr · {r.sections} section{r.sections === 1 ? "" : "s"}
                  </span>
                </span>
                <span className={styles.rating} data-tone={ratingTone(r.bestRating)} title="Best professor rating">
                  {formatRating(r.bestRating)}
                </span>
                <span className={styles.action}>{action(r)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.foot}>
          {q === "" && <span>Search by course code, name, or professor</span>}
          <span className={styles.keys}>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move <kbd>↵</kbd> {swapFor ? "swap" : "add"} <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </dialog>
  );
}
