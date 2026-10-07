import type { CSSProperties } from "react";
import { periodLabel, type Period } from "./periods";
import type { Course, Day, Instructor, Meeting, PlannedCourse, Section } from "./types";

export const WEEK: { day: Day; label: string }[] = [
  { day: "M", label: "MON" },
  { day: "T", label: "TUE" },
  { day: "W", label: "WED" },
  { day: "R", label: "THU" },
  { day: "F", label: "FRI" },
];

/** Shown only when a planned course meets on Saturday. */
export const SATURDAY: { day: Day; label: string } = { day: "S", label: "SAT" };

/** 575 → "9:35" (12-hour, no meridiem, as UF prints it). */
export function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
}

/** "9:35–10:25" */
export function formatRange(begin: number, end: number): string {
  return `${formatTime(begin)}–${formatTime(end)}`;
}

const DAY_ORDER = "MTWRFSU";

/** Meetings in weekday order, earliest first. */
export function sortedMeetings(section: Section): Meeting[] {
  const first = (m: Meeting) => Math.min(...m.days.map((d) => DAY_ORDER.indexOf(d)));
  return [...section.meetings].sort((a, b) => first(a) - first(b) || a.begin - b.begin);
}

/** "MWF · P3 · 9:35–10:25" */
export function formatMeeting(m: Meeting, periods: Period[]): string {
  const period = periodLabel(m.begin, m.end, periods);
  return [m.days.join(""), period, formatRange(m.begin, m.end)].filter(Boolean).join(" · ");
}

/** "Online" or "Time TBA" for a section with no meeting times. */
export function unscheduledLabel(section: Section): string {
  return section.delivery === "AD" ? "Online" : "Time TBA";
}

/** UF sectWeb as a badge: "Online", "Hybrid", or null for in person. */
export function deliveryLabel(section: Section): string | null {
  return section.delivery === "AD" ? "Online" : section.delivery === "HB" ? "Hybrid" : null;
}

const STAFF: Instructor = { name: "Staff", rating: null };

/** The section's lead instructor; UF lists co-instructors after. */
export function primaryInstructor(section: Section): Instructor {
  return section.instructors[0] ?? STAFF;
}

export function sectionRating(section: Section): number | null {
  return primaryInstructor(section).rating?.quality ?? null;
}

/** The professor's RateMyProfessors page, or a UF search for them when unmatched. */
export function rmpUrl(instructor: Instructor): string {
  if (instructor.rating) return `https://www.ratemyprofessors.com/professor/${instructor.rating.legacyId}`;
  return `https://www.ratemyprofessors.com/search/professors/1100?q=${encodeURIComponent(instructor.name)}`;
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
  color: number;
}

/** Joins a plan with loaded course details, skipping anything not loaded. */
export function resolvePlan(plan: PlannedCourse[], courses: Record<string, Course>): ResolvedEntry[] {
  return plan.flatMap(({ courseCode, classNumber, color }) => {
    const course = courses[courseCode];
    const section = course && findSection(course, classNumber);
    return course && section ? [{ course, section, color }] : [];
  });
}

export const COURSE_COLORS = 8;

/** CSS variables --c-bg, --c-bar, and --c-ink for a color slot (--cN-* in globals.css). */
export function courseColor(slot: number): CSSProperties {
  const n = ((slot % COURSE_COLORS) + COURSE_COLORS) % COURSE_COLORS;
  return { "--c-bg": `var(--c${n}-bg)`, "--c-bar": `var(--c${n}-bar)`, "--c-ink": `var(--c${n}-ink)` } as CSSProperties;
}

/** The first color slot no planned course is using. */
export function freeColor(plan: PlannedCourse[]): number {
  const used = new Set(plan.map((p) => p.color));
  for (let i = 0; i < COURSE_COLORS; i++) if (!used.has(i)) return i;
  return plan.length % COURSE_COLORS;
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

/** The best-rated section that fits around `entries`, else the best-rated one. */
export function bestSection(course: Course, entries: ResolvedEntry[]): Section {
  const sections = rankSections(course);
  return sections.find((s) => conflictsWith(s, entries, course.code).length === 0) ?? sections[0];
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
