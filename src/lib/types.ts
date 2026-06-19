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
export interface Finding {
  workerId: string;
  summary: string;
  claims: Array<{
    statement: string;
    evidenceUrl: string;
    confidence: "low" | "medium" | "high";
  }>;
  openQuestions: string[];
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
