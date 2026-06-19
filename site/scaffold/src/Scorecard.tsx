import { useMemo, useState } from "react";
import {
  QUESTIONS,
  TIER_META,
  scoreAnswers,
  type ScoreResult,
} from "./scoring";
import { BookingEmbed } from "./BookingEmbed";
import { track } from "./analytics";
import { DISCOVERY_CALL_LABEL } from "./config";

// The Pipeline Reliability Scorecard — the soft, secondary funnel path.
// Flow: questions → email gate (before the score reveal) → results.
//   • at-risk (high pain)  → inline Cal.com booking embed + reply CTA
//   • fragile / solid      → nurture checklist + soft "book a call" CTA
//
// Email is gated AFTER the questions and BEFORE results (lead-magnet decision).

type Phase = "questions" | "gate" | "results";
type SubmitStatus = "idle" | "submitting" | "ok" | "error";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function Scorecard() {
  const [phase, setPhase] = useState<Phase>("questions");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);

  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitMsg, setSubmitMsg] = useState("");

  const total = QUESTIONS.length;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === total;

  const result: ScoreResult | null = useMemo(
    () => (allAnswered ? scoreAnswers(answers) : null),
    [answers, allAnswered]
  );

  function choose(questionId: string, value: number) {
    if (!started) {
      setStarted(true);
      track("scorecard_started");
    }
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    // Auto-advance to the next unanswered question for momentum.
    if (current < total - 1) {
      setCurrent((c) => c + 1);
    } else if (Object.keys(next).length === total) {
      track("scorecard_completed");
      setPhase("gate");
    }
  }

  async function submitGate() {
    if (!EMAIL_RE.test(email)) {
      setSubmitStatus("error");
      setSubmitMsg("Enter a valid work email to see your results.");
      return;
    }
    if (!result) return;
    setSubmitStatus("submitting");
    setSubmitMsg("");

    const payload = {
      email: email.trim().toLowerCase(),
      company: company.trim(),
      source: "scorecard",
      ts: Date.now(),
      score: {
        raw: result.raw,
        max: result.max,
        percent: result.percent,
        tier: result.tier,
        dimensions: result.dimensions,
      },
      answers,
    };

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      track("lead_captured", { tier: result.tier, percent: result.percent });
      setSubmitStatus("ok");
      setPhase("results");
      track("results_viewed", { tier: result.tier });
    } catch {
      // Don't trap the lead behind a failed network call — still reveal results,
      // but signal that the emailed copy may be delayed.
      setSubmitStatus("error");
      setSubmitMsg(
        "We saved your score but couldn't reach the mail server — your results are below."
      );
      setPhase("results");
      track("results_viewed", { tier: result.tier, emailDelayed: true });
    }
  }

  // ── Phase: questions ──────────────────────────────────────────────────────
  if (phase === "questions") {
    const q = QUESTIONS[current];
    const pct = Math.round((answeredCount / total) * 100);
    return (
      <div className="card scorecard">
        <div className="sc-progress" aria-hidden="true">
          <div className="sc-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="sc-step">
          Question {current + 1} of {total}
        </p>
        <h3 className="sc-prompt">{q.prompt}</h3>
        <div className="sc-options" role="group" aria-label={q.prompt}>
          {q.options.map((opt) => {
            const selected = answers[q.id] === opt.value;
            return (
              <button
                key={opt.label}
                className={`sc-option ${selected ? "selected" : ""}`}
                onClick={() => choose(q.id, opt.value)}
                aria-pressed={selected}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="sc-nav">
          <button
            className="sc-back"
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
          >
            ← Back
          </button>
          {answers[q.id] !== undefined && current < total - 1 && (
            <button className="sc-next" onClick={() => setCurrent((c) => c + 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: email gate ─────────────────────────────────────────────────────
  if (phase === "gate") {
    return (
      <div className="card scorecard">
        <p className="eyebrow">YOUR SCORECARD IS READY</p>
        <h3 className="sc-prompt">Where should we send your full report?</h3>
        <p className="sc-gate-sub">
          See your reliability tier and the one dimension to fix first. We'll also
          email a copy plus the 23-point pipeline audit checklist. No spam — reply
          to unsubscribe any time.
        </p>
        <div className="capture">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            aria-label="Work email"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitGate()}
            disabled={submitStatus === "submitting"}
          />
        </div>
        <div className="capture">
          <input
            type="text"
            autoComplete="organization"
            placeholder="Company (optional)"
            value={company}
            aria-label="Company"
            onChange={(e) => setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitGate()}
            disabled={submitStatus === "submitting"}
          />
        </div>
        <button
          className="btn-primary sc-reveal"
          onClick={submitGate}
          disabled={submitStatus === "submitting"}
        >
          {submitStatus === "submitting" ? "Scoring…" : "Show my results"}
        </button>
        <p className={`form-msg ${submitStatus}`} role="status">
          {submitMsg}
        </p>
      </div>
    );
  }

  // ── Phase: results ────────────────────────────────────────────────────────
  if (!result) return null;
  const meta = TIER_META[result.tier];
  const weakest = result.weakest;

  return (
    <div className="card scorecard results">
      <p className="eyebrow">PIPELINE RELIABILITY SCORECARD</p>
      <div className="sc-score">
        <span className={`sc-score-num tier-${result.tier}`}>{result.percent}</span>
        <span className="sc-score-of">/ 100</span>
        <span className={`sc-tier tier-${result.tier}`}>{meta.name}</span>
      </div>
      <h3 className="sc-headline">{meta.headline}</h3>
      <p className="sc-summary">{meta.summary}</p>

      <div className="sc-dims">
        {result.dimensions.map((d) => (
          <div className="sc-dim" key={d.id}>
            <div className="sc-dim-head">
              <span>{d.label}</span>
              <span className="sc-dim-pct">{d.percent}%</span>
            </div>
            <div className="sc-dim-bar">
              <div
                className={`sc-dim-fill ${d.percent < 45 ? "low" : d.percent < 72 ? "mid" : "high"}`}
                style={{ width: `${d.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {weakest && (
        <p className="sc-focus">
          <strong>Fix first:</strong> {weakest.label} ({weakest.percent}%) is your
          weakest dimension — it's where pipeline risk is concentrated right now.
        </p>
      )}

      {submitMsg && (
        <p className={`form-msg ${submitStatus}`} role="status">
          {submitMsg}
        </p>
      )}

      {meta.booking ? (
        <div className="sc-booking">
          <h4 className="sc-booking-h">Grab a focused 20-minute reliability call</h4>
          <p className="sc-booking-sub">
            Your score puts you in the danger zone. On the call we'll pinpoint the
            single change that buys back the most trust, fastest — no pitch deck.
          </p>
          <BookingEmbed email={email} name={company} source="scorecard-at-risk" />
        </div>
      ) : (
        <div className="sc-nurture">
          <p>
            You're not in the danger zone — but there's room to harden. We've emailed
            your report plus the 23-point pipeline audit checklist to work through.
          </p>
          <a
            className="btn-primary"
            href="#book"
            onClick={() => track("cta_book_clicked", { from: "scorecard-nurture" })}
          >
            {DISCOVERY_CALL_LABEL}
          </a>
        </div>
      )}
    </div>
  );
}
