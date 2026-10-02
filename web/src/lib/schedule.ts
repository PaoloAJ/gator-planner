import type { Course, Day, PlannedCourse, Section } from "./types";
import { COURSE_BY_CODE } from "./mock-data";

export const WEEK: { day: Day; label: string }[] = [
  { day: "M", label: "MON" },
  { day: "T", label: "TUE" },
  { day: "W", label: "WED" },
  { day: "R", label: "THU" },
  { day: "F", label: "FRI" },
];

/** 575 → "9:35" (12-hour, no meridiem, as UF prints it). */
export function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
}

/** First meeting as "MWF 9:35", or "Time TBA". */
export function formatSchedule(section: Section): string {
  const first = section.meetings[0];
  if (!first) return "Time TBA";
  return `${first.days.join("")} ${formatTime(first.begin)}`;
}

export function lastName(name: string): string {
  return name.split(" ").at(-1) ?? name;
}

export function findSection(course: Course, sectionId: string): Section | undefined {
  return course.sections.find((s) => s.id === sectionId);
}

export function sectionsOverlap(a: Section, b: Section): boolean {
  return a.meetings.some((ma) =>
    b.meetings.some(
      (mb) => ma.days.some((d) => mb.days.includes(d)) && ma.begin < mb.end && mb.begin < ma.end,
    ),
  );
}

export interface ResolvedEntry {
  course: Course;
  section: Section;
}

export function resolvePlan(plan: PlannedCourse[]): ResolvedEntry[] {
  return plan.flatMap(({ courseCode, sectionId }) => {
    const course = COURSE_BY_CODE.get(courseCode);
    const section = course && findSection(course, sectionId);
    return course && section ? [{ course, section }] : [];
  });
}

/** Codes of other planned courses that clash with `section`. */
export function conflictsWith(section: Section, entries: ResolvedEntry[], ignoreCode: string): string[] {
  return entries
    .filter((e) => e.course.code !== ignoreCode && sectionsOverlap(section, e.section))
    .map((e) => e.course.code);
}

/** Sections ranked best-rated first; unrated sections last. */
export function rankSections(course: Course): Section[] {
  return [...course.sections].sort(
    (a, b) => (b.instructor.rmpRating ?? -1) - (a.instructor.rmpRating ?? -1),
  );
}

export type RatingTone = "good" | "ok" | "bad" | "none";

export function ratingTone(r: number | null): RatingTone {
  if (r == null) return "none";
  return r >= 4 ? "good" : r >= 3 ? "ok" : "bad";
}

export function formatRating(r: number | null): string {
  return r == null ? "—" : r.toFixed(1);
}

export function averageRating(entries: ResolvedEntry[]): number | null {
  const rated = entries.map((e) => e.section.instructor.rmpRating).filter((r): r is number => r != null);
  return rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
}

export function totalCredits(plan: PlannedCourse[]): number {
  return plan.reduce((sum, p) => sum + (COURSE_BY_CODE.get(p.courseCode)?.credits ?? 0), 0);
}
