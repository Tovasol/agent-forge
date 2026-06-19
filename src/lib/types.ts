// src/lib/types.ts
// Shared types for Agent Forge.

export type Autonomy = "gated" | "phased" | "research-only";
export type AuthMode = "subscription" | "apikey";

export type Phase =
  | "research"
  | "decide"
  | "build"
  | "deploy"
  | "optimize";

export const PHASE_ORDER: Phase[] = [
  "research",
  "decide",
  "build",
  "deploy",
  "optimize",
];

export interface Brief {
  businessName: string;
  niche: string;
  icp: string; // ideal customer profile
  monthlyBudgetUsd: number;
  services: string[]; // stack the operator already has
  goal: string;
  notes?: string;
}

export interface ForgeConfig {
  auth: AuthMode;
  apiKey?: string;
  models: {
    lead: string;
    worker: string;
    cheap: string;
  };
  maxBudgetUsd: number;
  maxTurns: number;
  maxParallelWorkers: number;
  // Ceiling on how many research facets the planner may create (NOT a target —
  // the planner chooses the count from the topic; this only caps runaway).
  maxResearchWorkers: number;
  // How many gap-closing rounds the research phase may run (spawn-new / sharpen).
  maxResearchRounds: number;
  // Usage-limit handling: pause and wait for the plan's limit to reset rather
  // than failing, so long runs survive usage windows.
  waitOnUsageLimit: boolean;
  usagePollMinutes: number; // re-check interval when no reset time is given
  usageMaxWaitHours: number; // 0 = unlimited (run for days/weeks)
  siteUrl: string; // live deployed URL, for self-validation (optional)
  autonomy: Autonomy;
  brief: Brief;
  research: {
    firecrawlKey?: string;
    exaKey?: string;
    tavilyKey?: string;
  };
  delivery: {
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    googleServiceAccountJson?: string;
    googleSheetsCrmId?: string;
  };
}

// A single research worker's job spec, produced by the orchestrator/plan.
export interface WorkerSpec {
  id: string;
  title: string;
  objective: string;
  questions: string[];
  outputFile: string; // memory/findings/<id>.json
}

// What a research worker must return (schema-enforced via prompt + validation).
// Distilled, NOT a raw dump: claims with sources, plus what they MEAN for the
// business and what to DO about them.
export interface Finding {
  workerId: string;
  summary: string;
  claims: Array<{
    statement: string;
    evidenceUrl: string;
    confidence: "low" | "medium" | "high";
  }>;
  implications: string[]; // what these findings mean for business success
  nextActions: string[]; // concrete actionable steps derived from the findings
  openQuestions: string[];
}

// A persisted raw-source record (disk tier) so future research can skip what's
// already covered. Lives on disk only — never loaded into the prompt context.
export interface SourceRecord {
  url: string;
  facet: string; // which research facet surfaced it
  snippet: string; // the material claim it supported
  fetchedAt: string;
}

// The distilled synthesis the rest of the pipeline consumes (instead of raw findings).
export interface ResearchSynthesis {
  builtAt: string;
  keyFindings: string[];
  conclusions: string[];
  nextActions: string[];
  facetsCovered: string[];
  saturationNote: string; // why research stopped (saturated / backstop)
}

// A scored option inside a decision artifact.
export interface DecisionOption {
  name: string;
  scores: Record<string, number>; // criterion -> 0..1
  monthlyCostUsd: number;
  evidenceUrls: string[];
  notes: string;
}

export interface Decision {
  id: string; // e.g. "email-provider"
  question: string;
  criteria: Array<{ name: string; weight: number }>;
  options: DecisionOption[];
  recommendation: string; // name of chosen option
  weightedScore: number;
  rationale: string;
  reversible: boolean;
  requiresSpend: boolean;
}

export type GateKind = "spend" | "deploy" | "phase";

export interface GateRequest {
  kind: GateKind;
  phase: Phase;
  title: string;
  detail: string;
  estimatedCostUsd?: number;
}
