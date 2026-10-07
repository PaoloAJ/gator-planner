import {
  courseColor,
  deliveryLabel,
  formatMeeting,
  formatRating,
  primaryInstructor,
  ratingTone,
  rmpUrl,
  sortedMeetings,
  timeAgo,
  unscheduledLabel,
} from "@/lib/schedule";
import { periodsFor } from "@/lib/periods";
import type { Course, Section } from "@/lib/types";
import styles from "./ProfessorRail.module.css";

interface Props {
  termCode: string;
  course: Course | null;
  /** The course's color slot in the plan. */
  color: number;
  /** Already ranked best-first. */
  sections: Section[];
  currentClass: number | null;
  pendingClass: number | null;
  /** classNumber → codes of planned courses it clashes with. */
  conflicts: Map<number, string[]>;
  timesScrapedAt: string | null;
  onPick: (classNumber: number) => void;
  onHover: (classNumber: number | null) => void;
  onSwap: () => void;
}

function seatsLabel(s: Section): string {
  if (s.openSeats == null) return "Seats TBA";
  if (s.openSeats === 0) return s.waitlistTotal ? `Full · ${s.waitlistTotal} waitlisted` : "Full";
  return `${s.openSeats} seat${s.openSeats === 1 ? "" : "s"}`;
}

const pct = (v: number | null | undefined) => `${((v ?? 0) / 5) * 100}%`;

export function ProfessorRail({
  termCode,
  course,
  color,
  sections,
  currentClass,
  pendingClass,
  conflicts,
  timesScrapedAt,
  onPick,
  onHover,
  onSwap,
}: Props) {
  if (!course) {
    return (
      <aside className={styles.rail}>
        <p className={styles.empty}>Add a course, then pick it to compare its professors and sections.</p>
      </aside>
    );
  }

  const periods = periodsFor(termCode);
  const canSwap = pendingClass != null && pendingClass !== currentClass;
  const pendingConflicts = (pendingClass != null && conflicts.get(pendingClass)) || [];

  return (
    <aside className={styles.rail} aria-label={`${course.code} sections`} style={courseColor(color)}>
      <div>
        <div className={styles.eyebrow}>
          <span className={styles.swatch} aria-hidden />
          {course.code} · {course.credits} CR
        </div>
        <h2 className={styles.title}>{course.name}</h2>
        <p className={styles.prereqs} title={course.prerequisites || undefined}>
          {course.prerequisites || "No prerequisites listed"}
        </p>
      </div>

      <div className={styles.sectionHead}>
        <span>PROFESSORS · RANKED</span>
        <span className={styles.fresh} suppressHydrationWarning>
          {timesScrapedAt ? `Seats as of ${timeAgo(timesScrapedAt)}` : "Seats unavailable"}
        </span>
      </div>

      <ol className={styles.list} onMouseLeave={() => onHover(null)}>
        {sections.map((s, i) => {
          const picked = s.classNumber === pendingClass;
          const clash = conflicts.get(s.classNumber) ?? [];
          const lead = primaryInstructor(s);
          const rating = lead.rating;
          const others = s.instructors.slice(1).map((x) => x.name);
          const delivery = deliveryLabel(s);
          return (
            <li key={s.classNumber} className={styles.card} data-picked={picked || undefined}>
              <button
                className={styles.pick}
                aria-pressed={picked}
                onClick={() => onPick(s.classNumber)}
                onMouseEnter={() => onHover(s.classNumber)}
                onFocus={() => onHover(s.classNumber)}
                onBlur={() => onHover(null)}
              >
                <span className={styles.cardHead}>
                  <span className={styles.rank}>#{i + 1}</span>
                  <span className={styles.prof}>{lead.name}</span>
                  {s.classNumber === currentClass && <span className={styles.badge}>In plan</span>}
                  <span className={styles.rating} data-tone={ratingTone(rating?.quality ?? null)}>
                    {formatRating(rating?.quality ?? null)}
                  </span>
                </span>
                {others.length > 0 && <span className={styles.coInstructors}>with {others.join(", ")}</span>}

                {rating == null ? (
                  <span className={styles.noRating}>No RateMyProfessors match</span>
                ) : (
                  <span className={styles.bars} title={`${rating.numRatings} ratings`}>
                    <span>Quality</span>
                    <span className={styles.track}>
                      <span className={styles.quality} style={{ width: pct(rating.quality) }} />
                    </span>
                    <span>Difficulty</span>
                    <span className={styles.track}>
                      <span className={styles.difficulty} style={{ width: pct(rating.difficulty) }} />
                    </span>
                  </span>
                )}

                <span className={styles.meetings}>
                  {s.meetings.length > 0 ? (
                    sortedMeetings(s).map((m, j) => (
                      <span key={j} title={[m.building, m.room].filter(Boolean).join(" ") || undefined}>
                        {formatMeeting(m, periods)}
                      </span>
                    ))
                  ) : (
                    <span>{unscheduledLabel(s)}</span>
                  )}
                </span>

                <span className={styles.foot}>
                  <span>
                    #{s.classNumber}
                    {delivery && <span className={styles.delivery}>{delivery}</span>}
                  </span>
                  <span data-full={s.openSeats === 0 || undefined}>{seatsLabel(s)}</span>
                </span>

                {clash.length > 0 && s.classNumber !== currentClass && (
                  <span className={styles.conflict}>Conflicts with {clash.join(", ")}</span>
                )}
              </button>
              {lead.name !== "Staff" && (
                <a className={styles.rmp} href={rmpUrl(lead)} target="_blank" rel="noopener noreferrer">
                  {rating ? `${rating.numRatings} ratings on RateMyProfessors` : "Search RateMyProfessors"} ↗
                </a>
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.footer}>
        <button className={styles.swap} disabled={!canSwap} onClick={onSwap}>
          {canSwap ? "Switch to selected section" : "Current section selected"}
        </button>
        {canSwap && pendingConflicts.length > 0 && (
          <p className={styles.warn}>Heads up: this overlaps {pendingConflicts.join(", ")}.</p>
        )}
      </div>
    </aside>
  );
}
