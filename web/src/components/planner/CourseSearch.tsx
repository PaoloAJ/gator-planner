"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { searchCourses } from "@/lib/api";
import { formatRating, ratingTone } from "@/lib/schedule";
import type { SearchResult } from "@/lib/types";
import styles from "./CourseSearch.module.css";

interface Props {
  termCode: string | null;
  plannedCodes: Set<string>;
  onAdd: (code: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

const DEBOUNCE_MS = 120;

interface Response {
  key: string; // term + query the results belong to
  results: SearchResult[];
  error?: string;
}

export function CourseSearch({ termCode, plannedCodes, onAdd, inputRef }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [response, setResponse] = useState<Response | null>(null);
  const listId = useId();

  const q = query.trim();
  const key = `${termCode}:${q}`;
  // Only show results for what's currently typed; anything else is in flight.
  const current = response?.key === key ? response : null;
  const results = current?.results ?? [];

  useEffect(() => {
    if (!q || !termCode) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      searchCourses(termCode, q, ctl.signal)
        .then((results) => setResponse({ key, results }))
        .catch((e: Error) => {
          if (!ctl.signal.aborted) setResponse({ key, results: [], error: e.message });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, termCode, key]);

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

  function choose(r: SearchResult) {
    onAdd(r.code);
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
              onMouseEnter={() => setActive(i)}
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
