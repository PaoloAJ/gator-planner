"use client";

import { useState } from "react";
import type { PlanAnswer, PlanQuestion } from "@/lib/types";
import styles from "./DegreePlanner.module.css";

const MAX_OTHER = 200; // server allows 300 per answer
const OTHER = "__other__";

interface Props {
  questions: PlanQuestion[];
  onAnswer: (answers: PlanAnswer[]) => void;
  onSkip: () => void;
}

export function PlanQuestions({ questions, onAnswer, onSkip }: Props) {
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [other, setOther] = useState<Record<number, string>>({});

  const answerFor = (i: number) => (choice[i] === OTHER ? (other[i] ?? "").trim() : choice[i]);
  const complete = questions.every((_, i) => answerFor(i));

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>A few questions first</h2>
      <p className={styles.lede}>
        Your audit leaves some real choices open. Your answers shape the plan; skip any you don’t care about.
      </p>

      {questions.map((q, i) => (
        <fieldset key={i} className={styles.group}>
          <legend>{q.question}</legend>
          <div className={styles.options} role="radiogroup">
            {[...q.options, OTHER].map((opt) => (
              <label key={opt} className={styles.option} data-selected={choice[i] === opt || undefined}>
                <input
                  type="radio"
                  name={`q${i}`}
                  checked={choice[i] === opt}
                  onChange={() => setChoice({ ...choice, [i]: opt })}
                />
                {opt === OTHER ? "Something else" : opt}
              </label>
            ))}
          </div>
          {choice[i] === OTHER && (
            <input
              className={styles.otherInput}
              value={other[i] ?? ""}
              maxLength={MAX_OTHER}
              placeholder="Your answer"
              onChange={(e) => setOther({ ...other, [i]: e.target.value })}
              autoFocus
            />
          )}
        </fieldset>
      ))}

      <div className={styles.row}>
        <button className={styles.secondary} onClick={onSkip}>
          Skip and plan anyway
        </button>
        <div className={styles.spacer} />
        <button
          className={styles.primary}
          disabled={!complete}
          onClick={() => onAnswer(questions.map((q, i) => ({ question: q.question, answer: answerFor(i) })))}
        >
          Build my plan
        </button>
      </div>
    </section>
  );
}
