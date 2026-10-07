import { formatRating, ratingTone } from "@/lib/schedule";
import type { DegreePlan } from "@/lib/types";
import styles from "./DegreePlanner.module.css";

interface Props {
  plan: DegreePlan;
  availableTerms: Set<string>;
  onOpenTerm: (termCode: string, courseCodes: string[]) => void;
  onAdjust: () => void;
  onStartOver: () => void;
}

const WORKLOAD_LABEL = { light: "Light", moderate: "Moderate", heavy: "Heavy", "": "" };

export function PlanRoadmap({ plan, availableTerms, onOpenTerm, onAdjust, onStartOver }: Props) {
  const activeTerms = plan.terms.filter((t) => !t.away && t.courses?.length);
  const total = plan.creditsCompleted + plan.creditsPlanned;

  return (
    <section className={styles.roadmap}>
      <div className={styles.roadmapHead}>
        <h2 className={styles.title}>Your plan</h2>
        <div className={styles.spacer} />
        <button className={styles.secondary} onClick={onAdjust}>
          Adjust preferences
        </button>
        <button className={styles.secondary} onClick={onStartOver}>
          Start over
        </button>
      </div>

      <div className={styles.stats}>
        <Stat label="Graduate" value={plan.graduationTerm || "—"} />
        <Stat label="Credits" value={`${total}`} detail={`${plan.creditsCompleted} done + ${plan.creditsPlanned} planned`} />
        <Stat label="Terms left" value={`${activeTerms.length}`} />
      </div>

      {plan.summary && <p className={styles.summary}>{plan.summary}</p>}

      {plan.problems && plan.problems.length > 0 && (
        <div className={styles.problems} role="alert">
          <b>Some checks still fail.</b> Review these before relying on the plan:
          <ul>
            {plan.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.milestones && plan.milestones.length > 0 && (
        <ol className={styles.milestones}>
          {plan.milestones.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
      )}

      <div className={styles.columns}>
        {plan.terms.map((t) => (
          <article key={t.code} className={styles.term} data-away={t.away || undefined}>
            <header className={styles.termHead}>
              <span className={styles.termName}>{t.label}</span>
              {!t.away && <span className={styles.termCredits}>{t.credits} cr</span>}
            </header>
            {t.away ? (
              <p className={styles.awayNote}>Away: no classes planned.</p>
            ) : (
              <>
                <div className={styles.termMeta}>
                  {t.workload && (
                    <span className={styles.workload} data-level={t.workload}>
                      {WORKLOAD_LABEL[t.workload]}
                      {t.difficulty != null && ` · difficulty ${t.difficulty.toFixed(1)}`}
                    </span>
                  )}
                </div>
                {t.focus && <p className={styles.focus}>{t.focus}</p>}
                {(t.courses ?? []).map((c) => (
                  <div key={c.code} className={styles.course}>
                    <div className={styles.courseTop}>
                      <span className={styles.code}>{c.code}</span>
                      <span className={styles.credits}>{c.credits} cr</span>
                    </div>
                    <div className={styles.name}>{c.name}</div>
                    <div className={styles.req}>{c.requirement}</div>
                    {c.reason && <p className={styles.reason}>{c.reason}</p>}
                    <div className={styles.courseMeta}>
                      {c.rating != null && (
                        <span className={styles.metaChip} data-tone={ratingTone(c.rating)} title="Best professor rating (RateMyProfessors)">
                          ★ {formatRating(c.rating)}
                        </span>
                      )}
                      {c.difficulty != null && (
                        <span className={styles.metaChip} title="Average difficulty (RateMyProfessors, 1–5)">
                          Difficulty {c.difficulty.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {c.prerequisites && <div className={styles.prereq}>Needs {c.prerequisites}</div>}
                  </div>
                ))}
                {availableTerms.has(t.code) ? (
                  <button
                    className={styles.open}
                    onClick={() =>
                      onOpenTerm(
                        t.code,
                        (t.courses ?? []).map((c) => c.code),
                      )
                    }
                  >
                    Open in week planner
                  </button>
                ) : (
                  <span className={styles.notYet}>Schedule not published yet</span>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      <div className={styles.notesGrid}>
        {(plan.preferencesApplied || plan.answers?.length) && (
          <section>
            <h3>How your preferences were used</h3>
            {plan.preferencesApplied && <p>{plan.preferencesApplied}</p>}
            {plan.answers && plan.answers.length > 0 && (
              <ul>
                {plan.answers.map((a) => (
                  <li key={a.question}>
                    {a.question} <b>{a.answer}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {plan.unresolved && plan.unresolved.length > 0 && (
          <section>
            <h3>Not planned</h3>
            <ul>
              {plan.unresolved.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </section>
        )}
        {plan.warnings && plan.warnings.length > 0 && (
          <section>
            <h3>Check with your advisor</h3>
            <ul>
              {plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className={styles.disclaimer}>
        This plan was generated by AI and checked against UF catalog data, but requirements change. Confirm it with your
        academic advisor before registering.
      </p>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {detail && <span className={styles.statDetail}>{detail}</span>}
    </div>
  );
}
