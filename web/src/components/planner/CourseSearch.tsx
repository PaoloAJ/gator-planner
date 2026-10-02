"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { formatRating, rankSections, ratingTone } from "@/lib/schedule";
import type { Course } from "@/lib/types";
import styles from "./CourseSearch.module.css";

interface Props {
  catalog: Course[];
  plannedCodes: Set<string>;
  onAdd: (course: Course) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

const MAX_RESULTS = 8;

/** Prefix matches on code beat matches in the name, which beat instructor matches. */
function search(catalog: Course[], query: string): Course[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const compact = q.replace(/\s/g, "");
  const scored = catalog.flatMap((c) => {
    const code = c.code.toLowerCase();
    const name = c.name.toLowerCase();
    let score = 0;
    if (code.startsWith(compact)) score = 3;
    else if (name.split(/\W+/).some((w) => w.startsWith(q)) || name.includes(q)) score = 2;
    else if (c.sections.some((s) => s.instructor.name.toLowerCase().includes(q))) score = 1;
    return score ? [{ c, score }] : [];
  });
  return scored
    .sort((a, b) => b.score - a.score || a.c.code.localeCompare(b.c.code))
    .slice(0, MAX_RESULTS)
    .map((r) => r.c);
}

export function CourseSearch({ catalog, plannedCodes, onAdd, inputRef }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = search(catalog, query);

  // "/" or ⌘K focuses search from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, [contenteditable]");
      if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputRef]);

  function choose(course: Course) {
    onAdd(course);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open && query.trim() !== "";

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
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" className={styles.list}>
          {results.length === 0 && <li className={styles.empty}>No courses match “{query.trim()}”</li>}
          {results.map((c, i) => {
            const best = rankSections(c)[0]?.instructor.rmpRating ?? null;
            const planned = plannedCodes.has(c.code);
            return (
              <li
                key={c.code}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                data-active={i === active || undefined}
                // mousedown so the input's blur doesn't close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className={styles.body}>
                  <span className={styles.code}>{c.code}</span>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.meta}>
                    {c.credits} cr · {c.sections.length} section{c.sections.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className={styles.rating} data-tone={ratingTone(best)}>
                  {formatRating(best)}
                </span>
                <span className={styles.action}>{planned ? "In plan" : "Add"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
