"use client";

import { useEffect, useState } from "react";
import { searchCourses } from "@/lib/api";
import type { SearchResult } from "@/lib/types";

const DEBOUNCE_MS = 120;

interface Response {
  key: string; // term + query the results belong to
  results: SearchResult[];
  error?: string;
}

/** Debounced course search for one term, shared by the top bar and the add-course dialog. */
export function useCourseSearch(termCode: string | null) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [response, setResponse] = useState<Response | null>(null);

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

  return {
    query,
    q,
    setQuery(v: string) {
      setQuery(v);
      setActive(0);
    },
    /** Null while the current query is in flight. */
    current,
    results,
    active,
    setActive,
    /** Moves the highlight; returns true if it handled the key. */
    moveActive(key: string): boolean {
      if (key === "ArrowDown") setActive((i) => Math.min(i + 1, results.length - 1));
      else if (key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
      else return false;
      return true;
    },
  };
}
