import type { CSSProperties } from "react";
import { formatRating, primaryInstructor, sectionRating, type ResolvedEntry } from "@/lib/schedule";
import styles from "./CourseList.module.css";

export interface ListStatus {
  kind: "busy" | "error";
  text: string;
}

interface Props {
  termLabel: string;
  credits: number;
  entries: ResolvedEntry[];
  selectedCode: string | null;
  status: ListStatus | null;
  onSelect: (code: string) => void;
  onRemove: (code: string) => void;
  onAdd: () => void;
}

function ringColor(r: number | null): string {
  if (r == null) return "var(--grid)";
  return r >= 4 ? "var(--uf-blue)" : r >= 3 ? "var(--ring-mid)" : "var(--uf-orange)";
}

export function CourseList({ termLabel, credits, entries, selectedCode, status, onSelect, onRemove, onAdd }: Props) {
  return (
    <section className={styles.panel} aria-label={`${termLabel} courses`}>
      <div className={styles.header}>
        <span>{termLabel.toUpperCase()} COURSES</span>
        <span className={styles.credits}>{credits} CR</span>
      </div>

      {entries.length === 0 && !status && (
        <p className={styles.empty}>No courses yet. Search by code, name, or professor to add one.</p>
      )}

      {entries.map(({ course, section }) => {
        const rating = sectionRating(section);
        const ring = {
          "--ring": ringColor(rating),
          "--deg": `${Math.round(((rating ?? 0) / 5) * 360)}deg`,
        } as CSSProperties;
        return (
          <div key={course.code} className={styles.item}>
            <button
              className={styles.card}
              data-active={course.code === selectedCode || undefined}
              aria-pressed={course.code === selectedCode}
              onClick={() => onSelect(course.code)}
            >
              <span className={styles.ring} style={ring} aria-label={`Professor rating ${formatRating(rating)}`}>
                <span className={styles.ringValue}>{formatRating(rating)}</span>
              </span>
              <span className={styles.text}>
                <span className={styles.code}>{course.code}</span>
                <span className={styles.name}>{course.name}</span>
                <span className={styles.prof}>{primaryInstructor(section).name}</span>
              </span>
            </button>
            <button
              className={styles.remove}
              aria-label={`Remove ${course.code}`}
              title={`Remove ${course.code}`}
              onClick={() => onRemove(course.code)}
            >
              ×
            </button>
          </div>
        );
      })}

      {status && (
        <p className={styles.status} data-kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      )}

      <button className={styles.add} onClick={onAdd}>
        + Add course
      </button>
    </section>
  );
}
