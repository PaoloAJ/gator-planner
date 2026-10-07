// UF term codes: "2" + YY + {spring:1, summer:5, fall:8}. Mirrors
// server/internal/term.

const SEMESTERS: Record<string, string> = { "1": "Spring", "5": "Summer", "8": "Fall" };

export function termLabel(code: string): string {
  return `${SEMESTERS[code[3]] ?? "Term"} 20${code.slice(1, 3)}`;
}

export function isSummer(code: string): boolean {
  return code[3] === "5";
}

export function currentTerm(d = new Date()): string {
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const m = d.getMonth() + 1;
  return `2${yy}${m <= 4 ? 1 : m <= 7 ? 5 : 8}`;
}

export function nextTerm(code: string): string {
  const yy = Number(code.slice(1, 3));
  const s = code[3];
  if (s === "1") return `2${String(yy).padStart(2, "0")}5`;
  if (s === "5") return `2${String(yy).padStart(2, "0")}8`;
  return `2${String(yy + 1).padStart(2, "0")}1`;
}

/** The next `n` fall/spring terms after the one in session. */
export function upcomingTerms(n: number, d = new Date()): string[] {
  const out: string[] = [];
  let code = nextTerm(currentTerm(d));
  while (out.length < n) {
    if (!isSummer(code)) out.push(code);
    code = nextTerm(code);
  }
  return out;
}

/**
 * The terms a plan may use, matching planner.Options.Window on the server:
 * from `start` through `target` (or `count` terms), skipping summers unless
 * included, capped at 18 terms.
 */
export function planningWindow(start: string, includeSummer: boolean, target?: string, count = 8): string[] {
  const out: string[] = [];
  let code = start;
  for (let i = 0; i < 54; i++) {
    if (includeSummer || !isSummer(code)) out.push(code);
    if (target ? code >= target || out.length >= 18 : out.length >= count) break;
    code = nextTerm(code);
  }
  return out;
}

/** The academic year a term belongs to, by its fall: Fall 2026, Spring 2027, and Summer 2027 are all 2026. */
export function academicYear(code: string): number {
  const year = 2000 + Number(code.slice(1, 3));
  return code[3] === "8" ? year : year - 1;
}

/** Fall, spring, and summer codes of the academic year starting in fall `year`. */
export function academicYearTerms(year: number): string[] {
  const yy = (y: number) => String(y % 100).padStart(2, "0");
  return [`2${yy(year)}8`, `2${yy(year + 1)}1`, `2${yy(year + 1)}5`];
}
