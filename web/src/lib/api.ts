// Client for the Go API. Requests go to /api/*, which next.config.ts rewrites
// to API_URL, so the browser never talks to the Go server directly.

import type { Course, PlanEvent, PlanOptions, SearchResult, Term } from "./types";

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

/**
 * Sends a degree audit to the planner and calls onEvent for each line of the
 * NDJSON response (progress updates, then the plan or an error).
 */
export async function streamDegreePlan(
  audit: unknown,
  options: PlanOptions,
  onEvent: (e: PlanEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit, ...options }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as PlanEvent);
    }
  }
  if (buffered.trim()) onEvent(JSON.parse(buffered) as PlanEvent);
}
