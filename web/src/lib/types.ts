// Domain types. These mirror the Postgres sketch in the root README (§3) so the
// mock data can later be swapped for the Go API without touching components.

/** UF day letters: R is Thursday. */
export type Day = "M" | "T" | "W" | "R" | "F";

export interface Term {
  /** "2" + YY + {spring:1, summer:5, fall:8}, e.g. Spring 2027 = "2271". */
  code: string;
  label: string;
  /** ISO date registration opens, if known. */
  registrationOpens?: string;
  /** Short status line shown when there's no registration date. */
  note?: string;
}

export interface Meeting {
  days: Day[];
  /** Minutes since midnight. */
  begin: number;
  end: number;
  building?: string;
  room?: string;
}

export interface Instructor {
  name: string;
  /** RateMyProfessors quality, 1–5. Null when unmatched. */
  rmpRating: number | null;
  /** RateMyProfessors difficulty, 1–5. */
  rmpDifficulty: number | null;
}

export interface Section {
  id: string;
  classNumber: number;
  instructor: Instructor;
  /** Empty when times are unavailable (stale session cookie) — render "TBA". */
  meetings: Meeting[];
  /** Null when seats are unavailable. */
  openSeats: number | null;
  waitlistTotal: number;
}

export interface Course {
  code: string;
  name: string;
  credits: number;
  prerequisites: string[];
  sections: Section[];
}

/** A course the student has put in a term's plan, pinned to one section. */
export interface PlannedCourse {
  courseCode: string;
  sectionId: string;
}

export interface StudentProfile {
  degree: string;
  creditsEarned: number;
  creditsRequired: number;
  completed: string[];
}
