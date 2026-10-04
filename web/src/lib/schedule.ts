import type { Course, Day, Instructor, PlannedCourse, Section } from "./types";

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

/** First meeting as "MWF 9:35", "Online", or "Time TBA". */
export function formatSchedule(section: Section): string {
  const first = section.meetings[0];
  if (first) return `${first.days.join("")} ${formatTime(first.begin)}`;
  return section.delivery === "AD" ? "Online" : "Time TBA";
}

const STAFF: Instructor = { name: "Staff", rating: null };

/** The section's lead instructor; UF lists co-instructors after. */
export function primaryInstructor(section: Section): Instructor {
  return section.instructors[0] ?? STAFF;
}

export function sectionRating(section: Section): number | null {
  return primaryInstructor(section).rating?.quality ?? null;
}

export function lastName(name: string): string {
  return name.split(" ").at(-1) ?? name;
}

export function findSection(course: Course, classNumber: number): Section | undefined {
  return course.sections.find((s) => s.classNumber === classNumber);
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

/** Joins a plan with loaded course details, skipping anything not loaded. */
export function resolvePlan(plan: PlannedCourse[], courses: Record<string, Course>): ResolvedEntry[] {
  return plan.flatMap(({ courseCode, classNumber }) => {
    const course = courses[courseCode];
    const section = course && findSection(course, classNumber);
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
  return [...course.sections].sort((a, b) => (sectionRating(b) ?? -1) - (sectionRating(a) ?? -1));
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
  const rated = entries.map((e) => sectionRating(e.section)).filter((r): r is number => r != null);
  return rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
}

export function totalCredits(entries: ResolvedEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.section.creditsMax ?? e.course.credits), 0);
}

/** "3 min ago", "2 h ago", "3 days ago". */
export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}
