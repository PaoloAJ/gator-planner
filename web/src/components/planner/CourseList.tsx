"use client";

import { useState, type CSSProperties } from "react";
import { courseColor, formatRating, primaryInstructor, sectionRating, type ResolvedEntry } from "@/lib/schedule";
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
  onSwap: (code: string) => void;
  onAdd: () => void;
}

function ringColor(r: number | null): string {
  if (r == null) return "var(--grid)";
  return r >= 4 ? "var(--uf-blue)" : r >= 3 ? "var(--ring-mid)" : "var(--uf-orange)";
}

export function CourseList({
  termLabel,
  credits,
  entries,
  selectedCode,
  status,
  onSelect,
  onRemove,
  onSwap,
  onAdd,
}: Props) {
  // Removing takes a second, deliberate click so a stray tap can't drop a course.
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section className={styles.panel} aria-label={`${termLabel} courses`}>
      <div className={styles.header}>
        <span>{termLabel.toUpperCase()} COURSES</span>
        <span className={styles.credits}>{credits} CR</span>
      </div>

      {entries.length === 0 && !status && (
        <p className={styles.empty}>No courses yet. Search by code, name, or professor to add one.</p>
      )}

      {entries.map(({ course, section, color }) => {
        const rating = sectionRating(section);
        const ring = {
          "--ring": ringColor(rating),
          "--deg": `${Math.round(((rating ?? 0) / 5) * 360)}deg`,
        } as CSSProperties;

        if (confirming === course.code) {
          return (
            <div
              key={course.code}
              className={styles.confirm}
              role="alertdialog"
              aria-label={`Remove ${course.code}?`}
              onKeyDown={(e) => e.key === "Escape" && setConfirming(null)}
            >
              <p>
                Remove <b>{course.code}</b> from your {termLabel} plan?
              </p>
              <div className={styles.confirmActions}>
                <button className={styles.keep} ref={(el) => el?.focus()} onClick={() => setConfirming(null)}>
                  Keep it
                </button>
                <button
                  className={styles.danger}
                  onClick={() => {
                    setConfirming(null);
                    onRemove(course.code);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={course.code} className={styles.item} style={courseColor(color)}>
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
            <div className={styles.actions}>
              <button
                className={styles.action}
                aria-label={`Swap ${course.code} for another course`}
                title="Swap for another course"
                onClick={() => onSwap(course.code)}
              >
                ⇄
              </button>
              <button
                className={styles.action}
                data-danger
                aria-label={`Remove ${course.code}`}
                title={`Remove ${course.code}`}
                onClick={() => setConfirming(course.code)}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}

      {status && (
        <p className={styles.status} data-kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      )}

      <button className={styles.add} onClick={onAdd} aria-keyshortcuts="Meta+K Control+K">
        <span>+ Add course</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>
    </section>
  );
}
