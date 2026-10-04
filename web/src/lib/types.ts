// Shapes returned by the Go API (server/internal/catalog). Keep in sync.

/** UF day letters: R is Thursday, S Saturday. */
export type Day = "M" | "T" | "W" | "R" | "F" | "S" | "U";

export interface Term {
  /** "2" + YY + {spring:1, summer:5, fall:8}, e.g. Spring 2027 = "2271". */
  code: string;
  label: string;
  /** YYYY-MM-DD, when known. */
  registrationOpens: string | null;
  scrapedAt: string | null;
  /** Last scrape that included meeting times and seats. */
  timesScrapedAt: string | null;
  courseCount: number;
  /** The term students are most likely planning (the next one). */
  suggested: boolean;
}

export interface Rating {
  legacyId: number;
  /** RateMyProfessors quality, 1–5. */
  quality: number;
  /** RateMyProfessors difficulty, 1–5. */
  difficulty: number;
  numRatings: number;
  wouldTakeAgain: number | null;
}

export interface Instructor {
  name: string;
  /** Null when unmatched on RateMyProfessors. */
  rating: Rating | null;
}

export interface Meeting {
  days: Day[];
  /** Minutes since midnight. */
  begin: number;
  end: number;
  building: string;
  room: string;
}

export interface Section {
  classNumber: number;
  sectionNumber: string;
  creditsMin: number | null;
  creditsMax: number | null;
  deptName: string;
  genEd: string[];
  gradBasis: string;
  /** UF sectWeb: PC in person, AD online, HB hybrid. */
  delivery: string;
  /** Null when seats are unavailable. */
  openSeats: number | null;
  waitlistCap: number;
  waitlistTotal: number;
  finalExam: string;
  dropAddDeadline: string;
  instructors: Instructor[];
  /** Empty when times are unavailable or the section is online. */
  meetings: Meeting[];
}

export interface Course {
  code: string;
  codeWithSpace: string;
  name: string;
  description: string;
  /** Free text from UF, e.g. "Prereq: (COP 3504 or COP 3503) and COT 3100…". */
  prerequisites: string;
  credits: number;
  sections: Section[];
}

export interface SearchResult {
  code: string;
  name: string;
  credits: number;
  sections: number;
  bestRating: number | null;
}

/** A course the student has put in a term's plan, pinned to one section. */
export interface PlannedCourse {
  courseCode: string;
  classNumber: number;
}
