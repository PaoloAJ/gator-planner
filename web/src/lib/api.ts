// Client for the Go API. Requests go to /api/*, which next.config.ts rewrites
// to API_URL, so the browser never talks to the Go server directly.

import type { Course, SearchResult, Term } from "./types";

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function fetchTerms(signal?: AbortSignal): Promise<Term[]> {
  return getJSON("/api/terms", signal);
}

export function searchCourses(termCode: string, q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, limit: "8" });
  return getJSON(`/api/terms/${termCode}/search?${params}`, signal);
}

export function fetchCourse(termCode: string, code: string, signal?: AbortSignal): Promise<Course> {
  return getJSON(`/api/terms/${termCode}/courses/${encodeURIComponent(code)}`, signal);
}
