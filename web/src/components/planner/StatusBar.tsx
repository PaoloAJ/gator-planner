import type { StudentProfile, Term } from "@/lib/types";
import styles from "./StatusBar.module.css";

interface Props {
  term: Term;
  student: StudentProfile;
  averageRating: number | null;
}

const DAY_MS = 86_400_000;

function registrationLine(term: Term): { text: string; detail?: string } {
  if (!term.registrationOpens) return { text: term.note ?? term.label };
  const opens = new Date(`${term.registrationOpens}T00:00:00`);
  const label = opens.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const days = Math.ceil((opens.getTime() - Date.now()) / DAY_MS);
  if (days <= 0) return { text: "Registration is open" };
  return { text: `Registration opens ${label}`, detail: `${days} day${days === 1 ? "" : "s"}` };
}

export function StatusBar({ term, student, averageRating }: Props) {
  const reg = registrationLine(term);
  return (
    <div className={styles.bar}>
      <span className={styles.reg} suppressHydrationWarning>
        <span className={styles.dot} aria-hidden />
        <b>{reg.text}</b>
        {reg.detail && <span className={styles.muted}>· {reg.detail}</span>}
      </span>
      <span className={styles.muted}>
        {student.degree} ·{" "}
        <b className={styles.stat}>
          {student.creditsEarned} / {student.creditsRequired} cr
        </b>
      </span>
      <span className={styles.muted}>
        Avg professor <b className={styles.stat}>{averageRating == null ? "—" : averageRating.toFixed(1)}</b>
      </span>
      <div className={styles.spacer} />
      <div className={styles.actions}>
        <button className={styles.secondary} aria-disabled title="Coming soon">
          Generate schedules
        </button>
        <button className={styles.primary} aria-disabled title="Coming soon">
          Export to ONE.UF
        </button>
      </div>
    </div>
  );
}
