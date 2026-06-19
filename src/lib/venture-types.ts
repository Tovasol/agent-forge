// src/lib/venture-types.ts
// Types for the venture-building engine: the stage-gated pipeline that drives a
// hint of an idea toward a live service business. Designed to be resumable
// across many sessions — all state persists to disk.

export type StageId =
  | "intake" // hint -> means inventory + affordable loss
  | "segmentation" // 6-12 market opportunities
  | "beachhead" // pick ONE niche  [STRATEGIC GATE]
  | "profile-tam" // end-user profile, persona, TAM
  | "jtbd-value" // job-to-be-done + quantified value prop
  | "model-offer" // business model + offer + pricing  [STRATEGIC GATE]
  | "validation" // customer discovery (prepares outreach; sending is gated)
  | "gtm" // go-to-market plan
  | "build" // productize / build the offer + site
  | "launch-growth"; // launch + self-optimizing growth loop

export const STAGE_ORDER: StageId[] = [
  "intake",
  "segmentation",
  "beachhead",
  "profile-tam",
  "jtbd-value",
  "model-offer",
  "validation",
  "gtm",
  "build",
  "launch-growth",
];

// Why a human must intervene. Everything else runs autonomously.
export type GateType =
  | "strategic" // niche / business-model approval (you steer direction)
  | "money" // any spend
  | "identity" // KYC / registration / banking
  | "legal" // entity formation, contracts, tax
  | "contact" // outreach to a named person
  | "taste" // brand / name / voice judgment
  | "none";

export interface StageDef {
  id: StageId;
  title: string;
  goal: string;
  keyQuestions: string[];
  inputs: string[];
  artifacts: string[]; // expected artifact filenames (logical)
  exitCriteria: string;
  // The gate that fires when this stage COMPLETES (before advancing), if any.
  gateOnComplete: GateType;
  // Skill playbooks the stage agent should load (progressive disclosure).
  skills: string[];
  // Reuse an existing engine phase for execution (build/launch reuse prior work).
  reusePhase?: "build" | "deploy" | "growth";
}

// A consequence-projecting decision brief — the universal output at every fork.
export interface DecisionBrief {
  id: string;
  stage: StageId;
  question: string;
  options: Array<{
    name: string;
    summary: string;
    evidenceUrls: string[];
    baseRate?: string; // reference-class anchor (outside view)
    projected1to3yr: string; // second-order consequences
    risks: string[];
    reversibility: "one-way" | "two-way"; // Bezos doors
    expectedValueNote?: string;
    confidence: number; // 0..1, calibrated
  }>;
  preMortem: string[]; // "assume this failed in 2 years — why?"
  recommendation: string; // option name
  rationale: string;
  needsHumanDecision: boolean; // one-way door or strategic/irreducible
  createdAt: string;
}

// An action the engine prepared but a human must authorize/execute.
export interface VentureGate {
  id: string;
  stage: StageId;
  gateType: GateType;
  title: string;
  whatYouDo: string; // the single human action
  whyGated: string;
  prepared: string[]; // artifact paths the agent staged to make it one-click
  estimatedCostUsd?: number;
  createdAt: string;
  decided?: "approved" | "rejected" | "done";
  decidedAt?: string;
}

export interface StageRecord {
  id: StageId;
  status: "pending" | "in-progress" | "blocked-on-gate" | "complete" | "skipped";
  artifacts: string[];
  decisionBriefIds: string[];
  notes: string[];
  startedAt?: string;
  completedAt?: string;
}

// The whole venture's persistent state — survives across sessions.
export interface VentureState {
  ventureId: string;
  hint: string;
  createdAt: string;
  updatedAt: string;
  currentStage: StageId | null;
  stages: Record<StageId, StageRecord>;
  pendingGateId: string | null;
  affordableLossUsd: number; // the human's stated risk ceiling
  totalSpendUsd: number;
  journal: Array<{ at: string; stage: StageId | "system"; note: string }>;
}
