import { formatRating, formatSchedule, formatTime, ratingTone } from "@/lib/schedule";
import type { Course, Section } from "@/lib/types";
import styles from "./ProfessorRail.module.css";

interface Props {
  course: Course | null;
  /** Already ranked best-first. */
  sections: Section[];
  currentId: string | null;
  pendingId: string | null;
  /** sectionId → codes of planned courses it clashes with. */
  conflicts: Map<string, string[]>;
  completed: string[];
  /** Courses planned in earlier terms; count toward prerequisites. */
  plannedEarlier: string[];
  scrapedAt: string;
  onPick: (sectionId: string) => void;
  onHover: (sectionId: string | null) => void;
  onSwap: () => void;
}

function minutesAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function seatsLabel(s: Section): string {
  if (s.openSeats == null) return "Seats TBA";
  if (s.openSeats === 0) return s.waitlistTotal ? `Full · ${s.waitlistTotal} waitlisted` : "Full";
  return `${s.openSeats} seats`;
}

const pct = (v: number | null) => `${((v ?? 0) / 5) * 100}%`;

export function ProfessorRail({
  course,
  sections,
  currentId,
  pendingId,
  conflicts,
  completed,
  plannedEarlier,
  scrapedAt,
  onPick,
  onHover,
  onSwap,
}: Props) {
  if (!course) {
    return (
      <aside className={styles.rail}>
        <p className={styles.empty}>Pick a course to compare its professors and sections.</p>
      </aside>
    );
  }

  const canSwap = pendingId != null && pendingId !== currentId;
  const pendingConflicts = (pendingId && conflicts.get(pendingId)) || [];

  return (
    <aside className={styles.rail} aria-label={`${course.code} sections`}>
      <div>
        <div className={styles.eyebrow}>
          {course.code} · {course.credits} CR
        </div>
        <h2 className={styles.title}>{course.name}</h2>
        <div className={styles.prereqs}>
          {course.prerequisites.length === 0
            ? "No prerequisites"
            : "Prereqs " +
              course.prerequisites
                .map((p) => `${p} ${completed.includes(p) ? "✓" : plannedEarlier.includes(p) ? "(planned)" : "✗"}`)
                .join(" · ")}
        </div>
      </div>

      <div className={styles.sectionHead}>
        <span>PROFESSORS · RANKED</span>
        <span className={styles.fresh} suppressHydrationWarning>
          Seats as of {minutesAgo(scrapedAt)}
        </span>
      </div>

      <ol className={styles.list} onMouseLeave={() => onHover(null)}>
        {sections.map((s, i) => {
          const picked = s.id === pendingId;
          const clash = conflicts.get(s.id) ?? [];
          const tone = ratingTone(s.instructor.rmpRating);
          const first = s.meetings[0];
          return (
            <li key={s.id}>
              <button
                className={styles.card}
                data-picked={picked || undefined}
                aria-pressed={picked}
                onClick={() => onPick(s.id)}
                onMouseEnter={() => onHover(s.id)}
                onFocus={() => onHover(s.id)}
                onBlur={() => onHover(null)}
              >
                <span className={styles.cardHead}>
                  <span className={styles.rank}>#{i + 1}</span>
                  <span className={styles.prof}>{s.instructor.name}</span>
                  {s.id === currentId && <span className={styles.badge}>In plan</span>}
                  <span className={styles.rating} data-tone={tone}>
                    {formatRating(s.instructor.rmpRating)}
                  </span>
                </span>

                {s.instructor.rmpRating == null ? (
                  <span className={styles.noRating}>No RateMyProfessors match</span>
                ) : (
                  <span className={styles.bars}>
                    <span>Quality</span>
                    <span className={styles.track}>
                      <span className={styles.quality} style={{ width: pct(s.instructor.rmpRating) }} />
                    </span>
                    <span>Difficulty</span>
                    <span className={styles.track}>
                      <span className={styles.difficulty} style={{ width: pct(s.instructor.rmpDifficulty) }} />
                    </span>
                  </span>
                )}

                <span className={styles.foot}>
                  <span title={first ? `${formatTime(first.begin)}–${formatTime(first.end)}` : undefined}>
                    {formatSchedule(s)}
                  </span>
                  <span data-full={s.openSeats === 0 || undefined}>{seatsLabel(s)}</span>
                </span>

                {clash.length > 0 && s.id !== currentId && (
                  <span className={styles.conflict}>Conflicts with {clash.join(", ")}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <button className={styles.swap} disabled={!canSwap} onClick={onSwap}>
        {canSwap ? "Swap to selected section" : "Current section selected"}
      </button>
      {canSwap && pendingConflicts.length > 0 && (
        <p className={styles.warn}>Heads up: this overlaps {pendingConflicts.join(", ")}.</p>
      )}
    </aside>
  );
}
