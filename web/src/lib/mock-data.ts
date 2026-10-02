// Sample data matching the GatorPlan design. Replace with the Go API once M1
// lands; components only depend on the shapes in ./types.

import type { Course, Day, Meeting, PlannedCourse, Section, StudentProfile, Term } from "./types";

export const TERMS: Term[] = [
  { code: "2271", label: "Spring 2027", registrationOpens: "2026-10-19" },
  { code: "2275", label: "Summer 2027", note: "Optional term" },
  { code: "2278", label: "Fall 2027", note: "Draft · ratings from last term" },
  { code: "2281", label: "Spring 2028", note: "Draft · expected graduation" },
];

export const STUDENT: StudentProfile = {
  degree: "B.S. Computer Science",
  creditsEarned: 68,
  creditsRequired: 120,
  completed: ["COP3502", "COP3503", "MAD2104", "MAC2311", "MAC2312", "PHY2048", "ENC1101"],
};

/** When the catalog was last scraped (README §5.3 freshness). */
export const SCRAPED_AT = "2026-10-02T13:48:00-04:00";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const meet = (days: string, begin: string, end: string, building?: string, room?: string): Meeting => ({
  days: days.split("") as Day[],
  begin: toMin(begin),
  end: toMin(end),
  building,
  room,
});

let classNumber = 11020;
const sec = (
  id: string,
  name: string,
  rating: number | null,
  difficulty: number | null,
  meetings: Meeting[],
  openSeats: number | null,
  waitlistTotal = 0,
): Section => ({
  id,
  classNumber: classNumber++,
  instructor: { name, rmpRating: rating, rmpDifficulty: difficulty },
  meetings,
  openSeats,
  waitlistTotal,
});

export const COURSES: Course[] = [
  {
    code: "COP3530",
    name: "Data Structures & Algorithms",
    credits: 3,
    prerequisites: ["COP3503", "MAD2104"],
    sections: [
      sec("COP3530-1", "A. Nguyen", 4.6, 3.4, [meet("MWF", "09:35", "10:25", "CSE", "E119")], 12),
      sec("COP3530-2", "T. Hale", 3.2, 4.1, [meet("TR", "11:45", "13:00", "LIT", "109")], 40),
      sec("COP3530-3", "P. Grant", 2.4, 4.5, [meet("MWF", "15:00", "15:50", "CSE", "A101")], 4, 3),
    ],
  },
  {
    code: "MAC2313",
    name: "Calculus 3",
    credits: 4,
    prerequisites: ["MAC2312"],
    sections: [
      sec("MAC2313-1", "L. Moreno", 4.1, 3.6, [meet("MWF", "11:45", "12:35", "LIT", "101")], 18),
      sec("MAC2313-2", "E. Castillo", 3.4, 3.2, [meet("TR", "10:40", "11:55", "LIT", "113")], 31),
      sec("MAC2313-3", "B. Fuller", 2.6, 4.0, [meet("MWF", "09:35", "10:25", "LIT", "127")], 6),
    ],
  },
  {
    code: "STA3032",
    name: "Engineering Statistics",
    credits: 3,
    prerequisites: ["MAC2312"],
    sections: [
      sec("STA3032-1", "R. Patel", 3.1, 3.0, [meet("TR", "08:30", "09:45", "FLO", "100")], 22),
      sec("STA3032-2", "H. Lee", 3.8, 2.7, [meet("MWF", "13:55", "14:45", "FLO", "230")], 9),
    ],
  },
  {
    code: "PHY2049",
    name: "Physics with Calculus 2",
    credits: 3,
    prerequisites: ["PHY2048", "MAC2312"],
    sections: [
      sec("PHY2049-1", "K. Brooks", 2.7, 4.2, [meet("TR", "13:55", "15:10", "NPB", "1001")], 51),
      sec("PHY2049-2", "O. Okafor", 3.9, 3.8, [meet("MWF", "08:30", "09:20", "NPB", "1002")], 0, 14),
    ],
  },
  {
    code: "ENC3246",
    name: "Professional Communication",
    credits: 3,
    prerequisites: ["ENC1101"],
    sections: [
      sec("ENC3246-1", "J. Kim", 4.8, 2.1, [meet("W", "15:00", "15:50", "TUR", "2322")], 3),
      sec("ENC3246-2", "M. Diaz", 4.2, 2.4, [meet("TR", "15:00", "16:15", "TUR", "2334")], 15),
      sec("ENC3246-3", "Staff", null, null, [], null),
    ],
  },
  {
    code: "CEN3031",
    name: "Intro to Software Engineering",
    credits: 3,
    prerequisites: ["COP3503"],
    sections: [
      sec("CEN3031-1", "D. Walsh", 3.6, 3.1, [meet("MWF", "10:40", "11:30", "CSE", "E121")], 27),
      sec("CEN3031-2", "S. Romero", 4.0, 3.3, [meet("TR", "16:05", "17:20", "CSE", "A101")], 8),
    ],
  },
  {
    code: "CIS4301",
    name: "Information & Database Systems",
    credits: 3,
    prerequisites: ["COP3530"],
    sections: [
      sec("CIS4301-1", "M. Ortiz", 4.3, 3.0, [meet("TR", "11:45", "13:00", "CSE", "E222")], 19),
      sec("CIS4301-2", "F. Abara", 3.5, 3.5, [meet("MWF", "13:55", "14:45", "CSE", "E119")], 33),
    ],
  },
  {
    code: "COT3100",
    name: "Discrete Structures",
    credits: 3,
    prerequisites: ["MAC2311"],
    sections: [
      sec("COT3100-1", "S. Iyer", 3.9, 3.7, [meet("MWF", "12:50", "13:40", "LIT", "121")], 14),
      sec("COT3100-2", "W. Chen", 3.3, 4.2, [meet("TR", "08:30", "09:45", "LIT", "109")], 41),
    ],
  },
  {
    code: "AST1002",
    name: "Discovering the Universe",
    credits: 3,
    prerequisites: [],
    sections: [sec("AST1002-1", "C. Vega", 4.4, 1.9, [meet("TR", "10:40", "11:55", "BRY", "130")], 87)],
  },
  {
    code: "HUM2305",
    name: "What Is the Good Life",
    credits: 3,
    prerequisites: [],
    sections: [
      sec("HUM2305-1", "G. Afolabi", 4.0, 2.2, [meet("MWF", "10:40", "11:30", "UAD", "101")], 120),
      sec("HUM2305-2", "Staff", null, null, [], null),
    ],
  },
  {
    code: "ECO2013",
    name: "Principles of Macroeconomics",
    credits: 3,
    prerequisites: [],
    sections: [sec("ECO2013-1", "N. Bauer", 3.3, 2.9, [meet("TR", "09:35", "10:50", "MAT", "18")], 64)],
  },
  {
    code: "COP4600",
    name: "Operating Systems",
    credits: 3,
    prerequisites: ["COP3530", "CDA3101"],
    sections: [sec("COP4600-1", "TBD", null, null, [meet("MWF", "11:45", "12:35", "CSE", "E121")], 45)],
  },
  {
    code: "CAP4630",
    name: "Artificial Intelligence",
    credits: 3,
    prerequisites: ["COP3530"],
    sections: [sec("CAP4630-1", "TBD", null, null, [meet("TR", "13:55", "15:10", "CSE", "E222")], 60)],
  },
  {
    code: "CIS4930",
    name: "Special Topics in CISE",
    credits: 3,
    prerequisites: [],
    sections: [sec("CIS4930-1", "TBD", null, null, [], null)],
  },
];

export const COURSE_BY_CODE = new Map(COURSES.map((c) => [c.code, c]));

/** Courses offered in a term. The mock offers everything every term. */
export function catalogForTerm(termCode: string): Course[] {
  void termCode;
  return COURSES;
}

const plan = (...ids: string[]): PlannedCourse[] =>
  ids.map((sectionId) => ({ courseCode: sectionId.split("-")[0], sectionId }));

export const INITIAL_PLANS: Record<string, PlannedCourse[]> = {
  "2271": plan("COP3530-1", "MAC2313-1", "STA3032-1", "PHY2049-1", "ENC3246-1"),
  "2275": plan("HUM2305-1", "ECO2013-1"),
  "2278": plan("CEN3031-1", "CIS4301-1", "COT3100-1", "AST1002-1"),
  "2281": plan("COP4600-1", "CAP4630-1", "CIS4930-1"),
};
