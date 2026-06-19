import { useEffect, useMemo, useRef, useState } from "react";
import {
  QUESTIONS,
  DIMENSIONS,
  scoreAnswers,
  TIER_META,
  type ScoreResult,
} from "./scorecard";
import { track, identify } from "./analytics";

// ─────────────────────────────────────────────────────────────────────────────
// PipelineForge — reliability-trust managed pipelines.
//
// Funnel (qualification-gated, per decision):
//   landing → scorecard (9 Qs) → email gate → tiered results
//     • at-risk tier  → inline Cal.com booking embed (qualified, high-pain)
//     • fragile/solid → nurture copy + soft CTA
//
// Aesthetic: technical precision for a skeptical Head of Data. Near-black ground,
// a single signal-green accent, monospace credibility cues. Restraint is the brand.
// ─────────────────────────────────────────────────────────────────────────────

// Cal.com link for the operator. Replace with the real event URL before launch.
const CAL_LINK = "https://cal.com/pipelineforge/audit";

type View = "landing" | "scorecard" | "gate" | "results";
type SubmitStatus = "idle" | "submitting" | "ok" | "error";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function App() {
  const [view, setView] = useState<View>("landing");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0); // current question index
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [formMsg, setFormMsg] = useState("");

  const result: ScoreResult | null = useMemo(() => {
    const answered = Object.keys(answers).length;
    if (answered < QUESTIONS.length) return null;
    return scoreAnswers(answers);
  }, [answers]);

  // Always recompute a *partial* result for routing once the gate is passed,
  // even if (defensively) something is missing.
  const finalResult = useMemo(() => scoreAnswers(answers), [answers]);

  function startScorecard(source: string) {
    track("scorecard_started", { source });
    setView("scorecard");
    setStep(0);
  }

  function choose(value: number) {
    const q = QUESTIONS[step];
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    track("scorecard_answered", { question: q.id, value, step: step + 1 });
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1);
    } else {
      track("scorecard_completed");
      setView("gate");
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
    else setView("landing");
  }

  async function submitGate() {
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setSubmitStatus("error");
      setFormMsg("Enter a valid work email so we can send your full report.");
      return;
    }
    setSubmitStatus("submitting");
    setFormMsg("");
    const payload = {
      email: cleanEmail,
      company: company.trim(),
      source: "scorecard",
      ts: Date.now(),
      score: {
        raw: finalResult.raw,
        max: finalResult.max,
        percent: finalResult.percent,
        tier: finalResult.tier,
        dimensions: finalResult.dimensions,
      },
      answers,
    };
    track("lead_submitted", { tier: finalResult.tier, percent: finalResult.percent });
    identify(cleanEmail, { tier: finalResult.tier });
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSubmitStatus("ok");
      track("lead_accepted", { tier: finalResult.tier });
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // Don't trap the user behind a backend hiccup — show their results anyway.
      setSubmitStatus("error");
      setFormMsg(
        "We couldn't reach our server, so your emailed copy may be delayed — but your results are ready below."
      );
      track("lead_error", { tier: finalResult.tier });
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="page">
      <SiteHeader onCta={() => startScorecard("topbar")} view={view} />

      {view === "landing" && <Landing onStart={() => startScorecard("hero")} />}

      {view === "scorecard" && (
        <Scorecard
          step={step}
          total={QUESTIONS.length}
          answers={answers}
          onChoose={choose}
          onBack={back}
        />
      )}

      {view === "gate" && (
        <Gate
          email={email}
          company={company}
          status={submitStatus}
          message={formMsg}
          onEmail={setEmail}
          onCompany={setCompany}
          onSubmit={submitGate}
          onBack={() => setView("scorecard")}
          previewPercent={finalResult.percent}
        />
      )}

      {view === "results" && (
        <Results
          result={result ?? finalResult}
          emailed={submitStatus === "ok"}
          warning={submitStatus === "error" ? formMsg : ""}
        />
      )}

      <SiteFooter />
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function SiteHeader({ onCta, view }: { onCta: () => void; view: View }) {
  return (
    <header className="topbar">
      <span className="mark">▚ pipelineforge</span>
      {view === "landing" && (
        <button className="topbar-cta" onClick={onCta}>
          Run the scorecard
        </button>
      )}
    </header>
  );
}

// ── Landing (hero + offer) ─────────────────────────────────────────────────────
function Landing({ onStart }: { onStart: () => void }) {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">FOR HEADS OF DATA AT 20–200 PERSON SAAS</p>
        <h1>
          The pipeline your team
          <br />
          <span className="accent">can actually trust.</span>
        </h1>
        <p className="sub">
          Managed ELT built around one promise: reliable data, caught before
          your stakeholders ever see a wrong number. No platform to learn, no
          on-call rotation to staff.
        </p>
        <div className="hero-actions">
          <button className="btn-primary" onClick={onStart}>
            Score your pipeline reliability — 2 min
          </button>
          <a className="btn-ghost" href="#offer">
            What you get ↓
          </a>
        </div>
        <p className="microcopy">
          9 questions across 5 reliability dimensions. Get a tiered report and a
          prioritized fix list. No call required.
        </p>
      </section>

      <section className="proof" aria-label="What reliable looks like">
        <div className="proof-item">
          <span className="num">stakeholders</span>
          <span>stop keeping their own spreadsheets</span>
        </div>
        <div className="proof-item">
          <span className="num">on-call</span>
          <span>stops being a person's whole weekend</span>
        </div>
        <div className="proof-item">
          <span className="num">3am</span>
          <span>stops being when you find out it broke</span>
        </div>
      </section>

      <section id="offer" className="offer">
        <h2>The Pipeline Reliability Scorecard</h2>
        <p className="offer-lead">
          A 2-minute self-assessment, built from the same checklist we run on
          every new client. It scores you across the five dimensions that decide
          whether data gets trusted — and tells you exactly where you're exposed.
        </p>
        <ul className="offer-dims">
          {DIMENSIONS.map((d) => (
            <li key={d.id}>
              <span className="dim-dot" aria-hidden="true" />
              {d.label}
            </li>
          ))}
        </ul>
        <div className="offer-grid">
          <div className="offer-card">
            <h3>Your reliability tier</h3>
            <p>
              An honest read — <em>Pipeline at Risk</em>, <em>Fragile but
              Holding</em>, or <em>Solid Foundation</em> — so you know how
              urgent this really is.
            </p>
          </div>
          <div className="offer-card">
            <h3>A prioritized fix list</h3>
            <p>
              Per-dimension scores that point to the highest-leverage change to
              make first — whether you fix it in-house or hand it to us.
            </p>
          </div>
          <div className="offer-card">
            <h3>Where you stand on pricing</h3>
            <p>
              Transparent next steps: a fixed-scope audit from $1,500, builds
              from $8,000, or an ongoing reliability retainer from $3,500/mo.
            </p>
          </div>
        </div>
        <button className="btn-primary wide" onClick={onStart}>
          Start the scorecard
        </button>
        <p className="microcopy center">
          Free. We email you a copy so you can share it with your team.
        </p>
      </section>
    </>
  );
}

// ── Scorecard ──────────────────────────────────────────────────────────────────
function Scorecard({
  step,
  total,
  answers,
  onChoose,
  onBack,
}: {
  step: number;
  total: number;
  answers: Record<string, number>;
  onChoose: (value: number) => void;
  onBack: () => void;
}) {
  const q = QUESTIONS[step];
  const pct = Math.round((step / total) * 100);
  const current = answers[q.id];
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the question on each step for screen-reader + keyboard users.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  return (
    <section className="quiz" aria-live="polite">
      <div className="quiz-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step + 1} aria-label="Scorecard progress">
        <div className="quiz-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="quiz-count">
        Question {step + 1} of {total} ·{" "}
        {DIMENSIONS.find((d) => d.id === q.dimension)?.label}
      </p>
      <h2 className="quiz-q" tabIndex={-1} ref={headingRef}>
        {q.prompt}
      </h2>
      <div className="quiz-options" role="radiogroup" aria-label={q.prompt}>
        {q.options.map((opt) => (
          <button
            key={opt.label}
            className={`quiz-option${current === opt.value ? " selected" : ""}`}
            role="radio"
            aria-checked={current === opt.value}
            onClick={() => onChoose(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button className="quiz-back" onClick={onBack}>
        ← Back
      </button>
    </section>
  );
}

// ── Email gate ──────────────────────────────────────────────────────────────────
function Gate({
  email,
  company,
  status,
  message,
  onEmail,
  onCompany,
  onSubmit,
  onBack,
  previewPercent,
}: {
  email: string;
  company: string;
  status: SubmitStatus;
  message: string;
  onEmail: (v: string) => void;
  onCompany: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  previewPercent: number;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  return (
    <section className="gate">
      <p className="eyebrow">YOUR RESULTS ARE READY</p>
      <h2>
        Where should we send your<br />reliability report?
      </h2>
      <p className="sub">
        Your score is calculated. Enter your work email to unlock the full
        tiered breakdown and your prioritized fix list — and we'll send a copy
        you can forward to your team.
      </p>

      <div className="gate-form">
        <label htmlFor="company" className="field-label">
          Company <span className="opt">(optional)</span>
        </label>
        <input
          id="company"
          type="text"
          placeholder="Acme Analytics"
          value={company}
          onChange={(e) => onCompany(e.target.value)}
          disabled={status === "submitting"}
        />

        <label htmlFor="email" className="field-label">
          Work email
        </label>
        <input
          id="email"
          ref={emailRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          disabled={status === "submitting"}
          aria-invalid={status === "error"}
        />

        <button
          className="btn-primary wide"
          onClick={onSubmit}
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Unlocking…" : "Show my results"}
        </button>
      </div>

      <p className={`form-msg ${status}`} role="status">
        {message}
      </p>
      <p className="microcopy center">
        No spam. One report email plus the occasional reliability tip. Unsubscribe anytime.
      </p>
      <button className="quiz-back center" onClick={onBack}>
        ← Back to the scorecard
      </button>
      {/* visually hide the raw percent, but keep it for assistive context */}
      <span className="sr-only">Your computed reliability score is {previewPercent} percent.</span>
    </section>
  );
}

// ── Tiered results ────────────────────────────────────────────────────────────
function Results({
  result,
  emailed,
  warning,
}: {
  result: ScoreResult;
  emailed: boolean;
  warning: string;
}) {
  const meta = TIER_META[result.tier];
  useEffect(() => {
    track("results_viewed", { tier: result.tier, percent: result.percent });
  }, [result.tier, result.percent]);

  return (
    <section className="results">
      <p className="eyebrow">YOUR PIPELINE RELIABILITY SCORE</p>

      <div className={`score-hero tier-${result.tier}`}>
        <div className="score-ring" aria-hidden="true">
          <span className="score-num">{result.percent}</span>
          <span className="score-unit">/100</span>
        </div>
        <div className="score-verdict">
          <span className="tier-tag">{meta.name}</span>
          <h2>{meta.headline}</h2>
          <p>{meta.summary}</p>
        </div>
      </div>

      {warning && (
        <p className="form-msg error" role="status">
          {warning}
        </p>
      )}
      {emailed && (
        <p className="form-msg ok" role="status">
          A copy is on its way to your inbox.
        </p>
      )}

      <h3 className="results-sub">By dimension</h3>
      <div className="dim-list">
        {result.dimensions.map((d) => (
          <div className="dim-row" key={d.id}>
            <span className="dim-name">{d.label}</span>
            <div className="dim-track">
              <div
                className={`dim-fill ${d.percent < 45 ? "low" : d.percent < 72 ? "mid" : "high"}`}
                style={{ width: `${d.percent}%` }}
              />
            </div>
            <span className="dim-pct">{d.percent}%</span>
          </div>
        ))}
      </div>

      {result.weakest && (
        <p className="weakest">
          Your biggest exposure right now is{" "}
          <strong>{result.weakest.label.toLowerCase()}</strong>. That's where a
          focused fix would buy back the most trust, fastest.
        </p>
      )}

      {/* Tiered CTA: high-pain → inline booking; mid/low → nurture. */}
      {meta.booking ? (
        <div className="cta-booking">
          <h3>This is fixable — and worth a focused conversation.</h3>
          <p>
            A 30-minute reliability call: we'll walk your weakest dimension and
            scope whether a fixed-price audit (from $1,500) gets you out of the
            danger zone. No pitch deck.
          </p>
          <div className="cal-embed">
            <iframe
              title="Book a reliability call"
              src={`${CAL_LINK}?embed=true`}
              loading="lazy"
              style={{ width: "100%", height: "640px", border: "0" }}
            />
          </div>
          <p className="microcopy center">
            Prefer email? Reply to the report we just sent and we'll find a time.
          </p>
        </div>
      ) : (
        <div className="cta-nurture">
          <h3>
            {result.tier === "fragile"
              ? "A few targeted changes would make this boring (the good kind)."
              : "You're ahead of most teams. Here's how to stay there."}
          </h3>
          <p>
            We just emailed your full report with a prioritized fix list. Work
            through it in-house — or if you'd rather hand reliability off, our
            fixed-scope audit starts at $1,500.
          </p>
          <div className="nurture-actions">
            <a className="btn-primary" href={CAL_LINK} target="_blank" rel="noopener noreferrer">
              Talk through your report
            </a>
            <a className="btn-ghost" href="#offer" onClick={() => window.scrollTo({ top: 0 })}>
              See how PipelineForge works
            </a>
          </div>
        </div>
      )}

      <div className="ladder">
        <h3 className="results-sub">How we'd work together</h3>
        <div className="ladder-grid">
          <div className="ladder-card">
            <span className="ladder-price">$1,500–$2,500</span>
            <span className="ladder-name">Reliability Audit</span>
            <p>A fixed-scope review of your pipelines with a prioritized remediation plan.</p>
          </div>
          <div className="ladder-card">
            <span className="ladder-price">from $8,000</span>
            <span className="ladder-name">Build</span>
            <p>We implement the fixes: monitoring, testing, recovery, and ownership.</p>
          </div>
          <div className="ladder-card">
            <span className="ladder-price">from $3,500/mo</span>
            <span className="ladder-name">Retainer</span>
            <p>Ongoing managed reliability so your pipelines stay boring.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer className="foot">
      <span>© {new Date().getFullYear()} PipelineForge</span>
      <span className="foot-note">The pipeline your team can actually trust.</span>
    </footer>
  );
}
