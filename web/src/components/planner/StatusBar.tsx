import { timeAgo } from "@/lib/schedule";
import type { Term } from "@/lib/types";
import styles from "./StatusBar.module.css";

interface Props {
  term: Term;
  courseCount: number;
  credits: number;
  averageRating: number | null;
}

const DAY_MS = 86_400_000;

function registrationLine(opensISO: string): { text: string; detail?: string } {
  const opens = new Date(`${opensISO}T00:00:00`);
  const label = opens.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const days = Math.ceil((opens.getTime() - Date.now()) / DAY_MS);
  if (days <= 0) return { text: "Registration is open" };
  return { text: `Registration opens ${label}`, detail: `${days} day${days === 1 ? "" : "s"}` };
}

export function StatusBar({ term, courseCount, credits, averageRating }: Props) {
  const reg = term.registrationOpens ? registrationLine(term.registrationOpens) : null;
  return (
    <div className={styles.bar}>
      {reg && (
        <span className={styles.reg} suppressHydrationWarning>
          <span className={styles.dot} aria-hidden />
          <b>{reg.text}</b>
          {reg.detail && <span className={styles.muted}>· {reg.detail}</span>}
        </span>
      )}
      <span className={styles.muted}>
        {courseCount} course{courseCount === 1 ? "" : "s"} · <b className={styles.stat}>{credits} cr</b> planned
      </span>
      <span className={styles.muted}>
        Avg professor <b className={styles.stat}>{averageRating == null ? "—" : averageRating.toFixed(1)}</b>
      </span>
      <span className={styles.muted} suppressHydrationWarning>
        {term.timesScrapedAt ? (
          <>Times &amp; seats updated {timeAgo(term.timesScrapedAt)}</>
        ) : (
          <span className={styles.warn}>Times &amp; seats unavailable, shown as TBA</span>
        )}
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
