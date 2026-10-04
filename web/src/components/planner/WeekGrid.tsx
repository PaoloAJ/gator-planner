import type { CSSProperties } from "react";
import {
  WEEK,
  formatTime,
  lastName,
  primaryInstructor,
  type ResolvedEntry,
} from "@/lib/schedule";
import type { Day } from "@/lib/types";
import styles from "./WeekGrid.module.css";

interface Props {
  entries: ResolvedEntry[];
  selectedCode: string | null;
  /** An alternative section to draw as a dashed ghost. */
  preview: ResolvedEntry | null;
  /** Shown over the grid when nothing is planned. */
  emptyHint: string;
  onSelect: (code: string) => void;
}

const HOUR_PX = 52;
const DEFAULT_START = 8;
const DEFAULT_END = 18;

interface Block {
  key: string;
  code: string;
  label: string;
  begin: number;
  end: number;
  accent: boolean;
  ghost: boolean;
  lane: number;
  lanes: number;
}

function blocksForDay(
  day: Day,
  entries: ResolvedEntry[],
  preview: ResolvedEntry | null,
  selectedCode: string | null,
) {
  const solid: Block[] = entries.flatMap(({ course, section }) =>
    section.meetings
      .filter((m) => m.days.includes(day))
      .map((m) => ({
        key: `${section.classNumber}-${m.begin}`,
        code: course.code,
        label: `${formatTime(m.begin)} · ${lastName(primaryInstructor(section).name)}`,
        begin: m.begin,
        end: m.end,
        accent: course.code === selectedCode,
        ghost: false,
        lane: 0,
        lanes: 1,
      })),
  );

  // Clashing blocks share the column side by side so neither hides the other.
  solid.sort((a, b) => a.begin - b.begin);
  for (const b of solid) {
    const clash = solid.filter((o) => o.begin < b.end && b.begin < o.end);
    b.lanes = clash.length;
    b.lane = clash.indexOf(b);
  }

  const ghosts: Block[] = preview
    ? preview.section.meetings
        .filter((m) => m.days.includes(day))
        .map((m) => ({
          key: `ghost-${preview.section.classNumber}-${m.begin}`,
          code: preview.course.code,
          label: `alt · ${lastName(primaryInstructor(preview.section).name)}`,
          begin: m.begin,
          end: m.end,
          accent: true,
          ghost: true,
          lane: 0,
          lanes: 1,
        }))
    : [];

  return [...solid, ...ghosts];
}

export function WeekGrid({
  entries,
  selectedCode,
  preview,
  emptyHint,
  onSelect,
}: Props) {
  const all = [...entries, ...(preview ? [preview] : [])].flatMap(
    (e) => e.section.meetings,
  );
  const start = Math.min(
    DEFAULT_START,
    ...all.map((m) => Math.floor(m.begin / 60)),
  );
  const end = Math.max(DEFAULT_END, ...all.map((m) => Math.ceil(m.end / 60)));
  const hours = Array.from({ length: end - start }, (_, i) => start + i);
  const unscheduled = entries.filter((e) => e.section.meetings.length === 0);

  const gridStyle = {
    "--hour": `${HOUR_PX}px`,
    height: hours.length * HOUR_PX,
  } as CSSProperties;

  return (
    <section className={styles.panel} aria-label="Weekly schedule">
      <div className={styles.scroller}>
        <div className={styles.inner}>
          <div className={styles.head} aria-hidden>
            <span />
            {WEEK.map((d) => (
              <span key={d.day}>{d.label}</span>
            ))}
          </div>
          <div className={styles.grid} style={gridStyle}>
            {entries.length === 0 && (
              <p className={styles.emptyHint}>{emptyHint}</p>
            )}
            <div className={styles.hours} aria-hidden>
              {hours.map((h) => (
                <span key={h}>
                  {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                </span>
              ))}
            </div>
            {WEEK.map(({ day, label }) => (
              <div key={day} className={styles.col}>
                {blocksForDay(day, entries, preview, selectedCode).map((b) => {
                  const style = {
                    top: ((b.begin - start * 60) / 60) * HOUR_PX,
                    height: ((b.end - b.begin) / 60) * HOUR_PX - 3,
                    "--lane": b.lane,
                    "--lanes": b.lanes,
                  } as CSSProperties;
                  const desc = `${b.code}, ${label} ${formatTime(b.begin)}–${formatTime(b.end)}`;
                  return b.ghost ? (
                    <div
                      key={b.key}
                      className={styles.ghost}
                      style={style}
                      aria-label={`Preview: ${desc}`}
                    >
                      <span className={styles.code}>{b.code}</span>
                      <span className={styles.meta}>{b.label}</span>
                    </div>
                  ) : (
                    <button
                      key={b.key}
                      className={styles.block}
                      style={style}
                      data-accent={b.accent || undefined}
                      data-conflict={b.lanes > 1 || undefined}
                      aria-label={
                        b.lanes > 1 ? `${desc} (time conflict)` : desc
                      }
                      onClick={() => onSelect(b.code)}
                    >
                      <span className={styles.code}>{b.code}</span>
                      <span className={styles.meta}>{b.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {unscheduled.length > 0 && (
        <p className={styles.note}>
          Not on the grid (online or time TBA):{" "}
          {unscheduled.map((e, i) => (
            <span key={e.course.code}>
              {i > 0 && ", "}
              <button
                className={styles.noteLink}
                onClick={() => onSelect(e.course.code)}
              >
                {e.course.code}
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
