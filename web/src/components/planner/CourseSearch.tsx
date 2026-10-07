"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { formatRating, ratingTone } from "@/lib/schedule";
import type { SearchResult } from "@/lib/types";
import { useCourseSearch } from "./useCourseSearch";
import styles from "./CourseSearch.module.css";

interface Props {
  termCode: string | null;
  plannedCodes: Set<string>;
  onAdd: (code: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function CourseSearch({ termCode, plannedCodes, onAdd, inputRef }: Props) {
  const [open, setOpen] = useState(false);
  const search = useCourseSearch(termCode);
  const { q, current, results, active } = search;
  const listId = useId();

  // "/" focuses search from anywhere (⌘K opens the add-course dialog).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputRef]);

  function choose(r: SearchResult) {
    onAdd(r.code);
    search.setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (search.moveActive(e.key)) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open && q !== "";

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        placeholder="Search courses or profs…"
        aria-label="Search courses or professors"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        disabled={!termCode}
        value={search.query}
        onChange={(e) => {
          search.setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
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
              // mousedown so the input's blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => search.setActive(i)}
            >
              <span className={styles.body}>
                <span className={styles.code}>{r.code}</span>
                <span className={styles.name}>{r.name}</span>
                <span className={styles.meta}>
                  {r.credits} cr · {r.sections} section{r.sections === 1 ? "" : "s"}
                </span>
              </span>
              <span className={styles.rating} data-tone={ratingTone(r.bestRating)} title="Best professor rating">
                {formatRating(r.bestRating)}
              </span>
              <span className={styles.action}>{plannedCodes.has(r.code) ? "In plan" : "Add"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
