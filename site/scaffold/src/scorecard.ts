// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Reliability Scorecard — the lead magnet.
//
// 9 questions across 5 canonical reliability dimensions. Each answer carries a
// score (higher = healthier). The total maps to a tier that routes the funnel:
//   - "at-risk"  → high pain  → inline Cal.com booking embed (qualified lead)
//   - "fragile"  → mid pain   → nurture + soft booking CTA
//   - "solid"    → low pain   → nurture only
//
// This logic is the qualification signal the funnel decision depends on. Keep it
// deterministic and pure so it can run identically on client and (later) server.
// ─────────────────────────────────────────────────────────────────────────────

export type DimensionId =
  | "detection"
  | "recovery"
  | "ownership"
  | "testing"
  | "trust";

export interface Dimension {
  id: DimensionId;
  label: string;
}

export const DIMENSIONS: Dimension[] = [
  { id: "detection", label: "Failure detection" },
  { id: "recovery", label: "Recovery & on-call" },
  { id: "ownership", label: "Ownership & process" },
  { id: "testing", label: "Testing & data quality" },
  { id: "trust", label: "Stakeholder trust" },
];

export interface Option {
  label: string;
  /** 0 (worst) … 3 (best) */
  value: number;
}

export interface Question {
  id: string;
  dimension: DimensionId;
  prompt: string;
  options: Option[];
}

// 9 questions. Each option is worth 0–3; max raw score = 9 * 3 = 27.
export const QUESTIONS: Question[] = [
  {
    id: "q1",
    dimension: "detection",
    prompt: "When a pipeline breaks, how do you usually find out?",
    options: [
      { label: "A stakeholder tells me the numbers look wrong", value: 0 },
      { label: "I happen to notice during a manual check", value: 1 },
      { label: "A basic alert fires (e.g. job-failed email)", value: 2 },
      { label: "Automated freshness/volume checks page us before anyone notices", value: 3 },
    ],
  },
  {
    id: "q2",
    dimension: "detection",
    prompt: "How much of your data has monitored freshness & volume expectations?",
    options: [
      { label: "None — we'd have to look manually", value: 0 },
      { label: "A few critical tables, set up ad hoc", value: 1 },
      { label: "Most core tables", value: 2 },
      { label: "Nearly everything, with thresholds we review", value: 3 },
    ],
  },
  {
    id: "q3",
    dimension: "recovery",
    prompt: "When a job fails overnight, what happens?",
    options: [
      { label: "It's broken until someone notices in the morning", value: 0 },
      { label: "Someone usually catches it but there's no plan", value: 1 },
      { label: "We have a runbook but recovery is manual", value: 2 },
      { label: "Auto-retry + clear escalation; rare manual touch", value: 3 },
    ],
  },
  {
    id: "q4",
    dimension: "recovery",
    prompt: "Typical time from failure to fully recovered data?",
    options: [
      { label: "Often more than a day", value: 0 },
      { label: "A few hours, depending who's around", value: 1 },
      { label: "Usually under an hour", value: 2 },
      { label: "Minutes — recovery is mostly automated", value: 3 },
    ],
  },
  {
    id: "q5",
    dimension: "ownership",
    prompt: "Who owns pipeline reliability?",
    options: [
      { label: "No one clearly — it lands on whoever's free", value: 0 },
      { label: "One overloaded person, informally", value: 1 },
      { label: "A named owner, but no backup", value: 2 },
      { label: "Clear ownership with documented coverage", value: 3 },
    ],
  },
  {
    id: "q6",
    dimension: "ownership",
    prompt: "How are pipeline changes deployed?",
    options: [
      { label: "Edited directly in production", value: 0 },
      { label: "Manual steps, no review", value: 1 },
      { label: "Version-controlled with some review", value: 2 },
      { label: "CI/CD with tests and staged rollout", value: 3 },
    ],
  },
  {
    id: "q7",
    dimension: "testing",
    prompt: "What testing runs before data reaches stakeholders?",
    options: [
      { label: "None to speak of", value: 0 },
      { label: "Occasional spot-checks", value: 1 },
      { label: "Schema + a few key assertions", value: 2 },
      { label: "Layered tests (schema, freshness, business rules) in CI", value: 3 },
    ],
  },
  {
    id: "q8",
    dimension: "testing",
    prompt: "How often do bad numbers reach a dashboard or report?",
    options: [
      { label: "Regularly — we're often firefighting", value: 0 },
      { label: "Every month or so", value: 1 },
      { label: "Rarely, and we usually catch it first", value: 2 },
      { label: "Almost never — issues are caught upstream", value: 3 },
    ],
  },
  {
    id: "q9",
    dimension: "trust",
    prompt: "Do business stakeholders trust the data?",
    options: [
      { label: "No — they keep their own spreadsheets", value: 0 },
      { label: "They double-check anything important", value: 1 },
      { label: "Mostly, with occasional skepticism", value: 2 },
      { label: "Yes — the warehouse is the source of truth", value: 3 },
    ],
  },
];

export const MAX_SCORE = QUESTIONS.length * 3; // 27

export type Tier = "at-risk" | "fragile" | "solid";

export interface ScoreResult {
  raw: number;
  max: number;
  /** 0–100 */
  percent: number;
  tier: Tier;
  /** per-dimension percent, 0–100 */
  dimensions: { id: DimensionId; label: string; percent: number }[];
  /** dimension that scored worst, for tailored copy */
  weakest: { id: DimensionId; label: string; percent: number } | null;
}

export interface TierMeta {
  tier: Tier;
  name: string;
  headline: string;
  summary: string;
  /** whether this tier routes to an inline booking embed */
  booking: boolean;
}

export const TIER_META: Record<Tier, TierMeta> = {
  "at-risk": {
    tier: "at-risk",
    name: "Pipeline at Risk",
    headline: "Your pipelines are one bad night from a fire drill.",
    summary:
      "Failures are found by stakeholders, recovery is manual, and trust is leaking. This is exactly the situation a focused reliability audit is built to fix — fast.",
    booking: true,
  },
  fragile: {
    tier: "fragile",
    name: "Fragile but Holding",
    headline: "It works — until the one person who knows is on vacation.",
    summary:
      "You have some guardrails, but ownership and recovery depend on heroics. A few targeted changes would move you from 'usually fine' to 'boringly reliable'.",
    booking: false,
  },
  solid: {
    tier: "solid",
    name: "Solid Foundation",
    headline: "Your pipelines are in good shape.",
    summary:
      "Detection, recovery, and trust are largely handled. The opportunity now is hardening the edges and removing the last sources of toil.",
    booking: false,
  },
};

export function tierFor(percent: number): Tier {
  if (percent < 45) return "at-risk";
  if (percent < 72) return "fragile";
  return "solid";
}

/** answers: map of questionId -> chosen option value (0–3) */
export function scoreAnswers(answers: Record<string, number>): ScoreResult {
  let raw = 0;
  const byDim: Record<string, { sum: number; max: number; label: string }> = {};
  for (const d of DIMENSIONS) byDim[d.id] = { sum: 0, max: 0, label: d.label };

  for (const q of QUESTIONS) {
    const v = answers[q.id] ?? 0;
    raw += v;
    byDim[q.dimension].sum += v;
    byDim[q.dimension].max += 3;
  }

  const percent = Math.round((raw / MAX_SCORE) * 100);
  const dimensions = DIMENSIONS.map((d) => {
    const rec = byDim[d.id];
    return {
      id: d.id,
      label: d.label,
      percent: rec.max ? Math.round((rec.sum / rec.max) * 100) : 0,
    };
  });

  const weakest =
    dimensions.length > 0
      ? dimensions.reduce((a, b) => (b.percent < a.percent ? b : a))
      : null;

  return { raw, max: MAX_SCORE, percent, tier: tierFor(percent), dimensions, weakest };
}
