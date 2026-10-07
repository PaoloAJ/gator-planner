// UF class periods. Fall and spring use 50-minute periods 1–11 plus evening
// periods E1–E3; summer uses 75-minute periods 1–9. The Schedule of Courses
// only gives clock times, so periods are matched from those.

import { isSummer } from "./terms";

export interface Period {
  /** "3", "E1" */
  label: string;
  /** Minutes since midnight. */
  begin: number;
  end: number;
}

const at = (h: number, m: number) => h * 60 + m;

const FALL_SPRING: Period[] = [
  { label: "1", begin: at(7, 25), end: at(8, 15) },
  { label: "2", begin: at(8, 30), end: at(9, 20) },
  { label: "3", begin: at(9, 35), end: at(10, 25) },
  { label: "4", begin: at(10, 40), end: at(11, 30) },
  { label: "5", begin: at(11, 45), end: at(12, 35) },
  { label: "6", begin: at(12, 50), end: at(13, 40) },
  { label: "7", begin: at(13, 55), end: at(14, 45) },
  { label: "8", begin: at(15, 0), end: at(15, 50) },
  { label: "9", begin: at(16, 5), end: at(16, 55) },
  { label: "10", begin: at(17, 10), end: at(18, 0) },
  { label: "11", begin: at(18, 15), end: at(19, 5) },
  { label: "E1", begin: at(19, 20), end: at(20, 10) },
  { label: "E2", begin: at(20, 20), end: at(21, 10) },
  { label: "E3", begin: at(21, 20), end: at(22, 10) },
];

const SUMMER: Period[] = [
  { label: "1", begin: at(8, 0), end: at(9, 15) },
  { label: "2", begin: at(9, 30), end: at(10, 45) },
  { label: "3", begin: at(11, 0), end: at(12, 15) },
  { label: "4", begin: at(12, 30), end: at(13, 45) },
  { label: "5", begin: at(14, 0), end: at(15, 15) },
  { label: "6", begin: at(15, 30), end: at(16, 45) },
  { label: "7", begin: at(17, 0), end: at(18, 15) },
  { label: "8", begin: at(18, 30), end: at(19, 45) },
  { label: "9", begin: at(20, 0), end: at(21, 15) },
];

export function periodsFor(termCode: string): Period[] {
  return isSummer(termCode) ? SUMMER : FALL_SPRING;
}

/** "P3", "P3–4", "P11–E1", or "E1"; null when the time matches no period. */
export function periodLabel(begin: number, end: number, periods: Period[]): string | null {
  const hit = periods.filter((p) => p.begin < end && begin < p.end);
  const first = hit[0];
  const last = hit.at(-1);
  if (!first || !last) return null;
  const name = first.label.startsWith("E") ? first.label : `P${first.label}`;
  return first === last ? name : `${name}–${last.label}`;
}
