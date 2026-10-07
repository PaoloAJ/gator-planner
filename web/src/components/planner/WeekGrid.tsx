"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  SATURDAY,
  WEEK,
  courseColor,
  formatRange,
  formatTime,
  lastName,
  primaryInstructor,
  unscheduledLabel,
  type ResolvedEntry,
} from "@/lib/schedule";
import { periodLabel, periodsFor, type Period } from "@/lib/periods";
import type { Day } from "@/lib/types";
import styles from "./WeekGrid.module.css";

interface Props {
  termCode: string;
  entries: ResolvedEntry[];
  selectedCode: string | null;
  /** An alternative section to draw as a dashed ghost. */
  preview: ResolvedEntry | null;
  /** Shown over the grid when nothing is planned. */
  emptyHint: string;
  onSelect: (code: string) => void;
}

/** Smallest scale that keeps a 50-minute block readable; the grid grows from here to fill the screen. */
const MIN_PX_PER_MIN = 0.8;
/** Where the workspace has a fixed height (Planner.module.css), so the grid can fill it. */
const FILL_QUERY = "(min-width: 1101px)";
/** The grid always runs through the periods that start before 8 pm. */
const DEFAULT_END = 20 * 60;

interface Block {
  key: string;
  code: string;
  color: number;
  period: string | null;
  time: string;
  where: string;
  begin: number;
  end: number;
  selected: boolean;
  ghost: boolean;
  lane: number;
  lanes: number;
}

function blocksForDay(
  day: Day,
  entries: ResolvedEntry[],
  preview: ResolvedEntry | null,
  selectedCode: string | null,
  periods: Period[],
) {
  const toBlocks = ({ course, section, color }: ResolvedEntry, ghost: boolean): Block[] =>
    section.meetings
      .filter((m) => m.days.includes(day))
      .map((m) => {
        const prof = lastName(primaryInstructor(section).name);
        return {
          key: `${ghost ? "ghost-" : ""}${section.classNumber}-${m.begin}`,
          code: course.code,
          color,
          period: periodLabel(m.begin, m.end, periods),
          time: `${formatRange(m.begin, m.end)} · ${ghost ? `alt · ${prof}` : prof}`,
          where: [m.building, m.room].filter(Boolean).join(" "),
          begin: m.begin,
          end: m.end,
          selected: course.code === selectedCode,
          ghost,
          lane: 0,
          lanes: 1,
        };
      });

  const solid = entries.flatMap((e) => toBlocks(e, false));

  // Clashing blocks share the column side by side so neither hides the other.
  solid.sort((a, b) => a.begin - b.begin);
  for (const b of solid) {
    const clash = solid.filter((o) => o.begin < b.end && b.begin < o.end);
    b.lanes = clash.length;
    b.lane = clash.indexOf(b);
  }

  return [...solid, ...(preview ? toBlocks(preview, true) : [])];
}

export function WeekGrid({ termCode, entries, selectedCode, preview, emptyHint, onSelect }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  // Height left for the grid under the day header and online row; null where the page scrolls instead.
  const [fit, setFit] = useState<number | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const top = topRef.current;
    if (!panel || !top) return;
    const media = window.matchMedia(FILL_QUERY);
    function measure() {
      if (!panel || !top || !media.matches) return setFit(null);
      const css = getComputedStyle(panel);
      const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
      setFit(Math.floor(panel.clientHeight - padding - top.offsetHeight) - 1);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(top);
    media.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, []);

  const all = [...entries, ...(preview ? [preview] : [])].flatMap((e) => e.section.meetings);
  const days = all.some((m) => m.days.includes("S")) ? [...WEEK, SATURDAY] : WEEK;

  const periods = periodsFor(termCode);
  const latest = Math.max(DEFAULT_END, ...all.map((m) => m.end));
  const shown = periods.filter((p) => p.begin < latest);
  const start = Math.min(shown[0].begin, ...all.map((m) => m.begin));
  const end = Math.max(shown[shown.length - 1].end, latest);
  const pxPerMin = fit ? Math.max(MIN_PX_PER_MIN, fit / (end - start)) : MIN_PX_PER_MIN;
  const y = (min: number) => (min - start) * pxPerMin;

  const unscheduled = entries.filter((e) => e.section.meetings.length === 0);
  const ghostUnscheduled = preview && preview.section.meetings.length === 0 ? preview : null;

  return (
    <section ref={panelRef} className={styles.panel} aria-label="Weekly schedule">
      <div className={styles.scroller}>
        <div className={styles.inner} style={{ "--days": days.length } as CSSProperties}>
          <div ref={topRef}>
            <div className={styles.head} aria-hidden>
              <span />
              {days.map((d) => (
                <span key={d.day}>{d.label}</span>
              ))}
            </div>

            {(unscheduled.length > 0 || ghostUnscheduled) && (
              <div className={styles.online} aria-label="Online and time TBA classes">
                <span className={styles.onlineLabel}>ONLINE</span>
                <div className={styles.onlineItems}>
                  {unscheduled.map((e) => (
                    <button
                      key={e.course.code}
                      className={styles.chip}
                      style={courseColor(e.color)}
                      data-selected={e.course.code === selectedCode || undefined}
                      onClick={() => onSelect(e.course.code)}
                    >
                      <span className={styles.code}>{e.course.code}</span>
                      <span className={styles.meta}>
                        {unscheduledLabel(e.section)} · {lastName(primaryInstructor(e.section).name)}
                      </span>
                    </button>
                  ))}
                  {ghostUnscheduled && (
                    <span className={styles.chip} data-ghost style={courseColor(ghostUnscheduled.color)}>
                      <span className={styles.code}>{ghostUnscheduled.course.code}</span>
                      <span className={styles.meta}>
                        alt · {unscheduledLabel(ghostUnscheduled.section)} ·{" "}
                        {lastName(primaryInstructor(ghostUnscheduled.section).name)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={styles.grid} style={{ height: y(end) }}>
            {entries.length === 0 && <p className={styles.emptyHint}>{emptyHint}</p>}

            <div className={styles.bands} aria-hidden>
              {shown.map((p) => (
                <span key={p.label} style={{ top: y(p.begin), height: (p.end - p.begin) * pxPerMin }} />
              ))}
            </div>

            <div className={styles.periods} aria-hidden>
              {shown.map((p) => (
                <span key={p.label} style={{ top: y(p.begin), height: (p.end - p.begin) * pxPerMin }}>
                  <b>{p.label.startsWith("E") ? p.label : `P${p.label}`}</b>
                  {formatTime(p.begin)}
                </span>
              ))}
            </div>

            {days.map(({ day, label }) => (
              <div key={day} className={styles.col}>
                {blocksForDay(day, entries, preview, selectedCode, periods).map((b) => {
                  const style = {
                    ...courseColor(b.color),
                    top: y(b.begin),
                    height: (b.end - b.begin) * pxPerMin - 2,
                    "--lane": b.lane,
                    "--lanes": b.lanes,
                  } as CSSProperties;
                  const desc = `${b.code}, ${label} ${b.period ? `${b.period} ` : ""}${b.time}`;
                  const body = (
                    <>
                      <span className={styles.blockTop}>
                        <span className={styles.code}>{b.code}</span>
                        {b.period && <span className={styles.period}>{b.period}</span>}
                      </span>
                      <span className={styles.meta}>{b.time}</span>
                      {b.where && <span className={styles.meta}>{b.where}</span>}
                    </>
                  );
                  return b.ghost ? (
                    <div key={b.key} className={styles.ghost} style={style} aria-label={`Preview: ${desc}`}>
                      {body}
                    </div>
                  ) : (
                    <button
                      key={b.key}
                      className={styles.block}
                      style={style}
                      data-selected={b.selected || undefined}
                      data-conflict={b.lanes > 1 || undefined}
                      aria-label={b.lanes > 1 ? `${desc} (time conflict)` : desc}
                      onClick={() => onSelect(b.code)}
                    >
                      {body}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
