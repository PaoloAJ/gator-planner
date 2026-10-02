import type { CSSProperties } from "react";
import { formatRating, type ResolvedEntry } from "@/lib/schedule";
import styles from "./CourseList.module.css";

interface Props {
  termLabel: string;
  credits: number;
  entries: ResolvedEntry[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onRemove: (code: string) => void;
  onAdd: () => void;
}

function ringColor(r: number | null): string {
  if (r == null) return "var(--grid)";
  return r >= 4 ? "var(--uf-blue)" : r >= 3 ? "var(--ring-mid)" : "var(--uf-orange)";
}

export function CourseList({ termLabel, credits, entries, selectedCode, onSelect, onRemove, onAdd }: Props) {
  return (
    <section className={styles.panel} aria-label={`${termLabel} courses`}>
      <div className={styles.header}>
        <span>{termLabel.toUpperCase()} COURSES</span>
        <span className={styles.credits}>{credits} CR</span>
      </div>

      {entries.length === 0 && <p className={styles.empty}>No courses yet. Search to add your first one.</p>}

      {entries.map(({ course, section }) => {
        const rating = section.instructor.rmpRating;
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
                <span className={styles.prof}>{section.instructor.name}</span>
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

      <button className={styles.add} onClick={onAdd}>
        + Add course
      </button>
    </section>
  );
}
