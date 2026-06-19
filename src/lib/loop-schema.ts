// src/lib/loop-schema.ts
// The codified, idea-AGNOSTIC venture framework, expressed as DATA (not hardcoded
// control flow) so the self-improving meta-loop can rewrite stages, checklists,
// and gates without code changes. This is the "procedural memory" of the system.
//
// Grounding: synthesized from the two research reports — Hormozi ($100M Offers/Leads),
// Y Combinator, Lean Startup / Customer Development (Blank, Ries), venture studios
// (PSL "Volume/Velocity/Value"), MBB structured problem-solving, Dunford positioning,
// Weinberg/Mares "Traction" Bullseye, and productized-service / bootstrapper practice.
//
// The corrected master sequence makes MARKETING the spine: willingness-to-pay is
// validated only AFTER a real marketing engine produces qualified demand.

/** Whether a checklist item needs live external market data or is internal reasoning. */
export type DataNeed = "live" | "internal" | "mixed";

/** A single, evidence-bearing checklist item within a stage. */
export interface ChecklistItem {
  id: string;
  text: string;
  /** Does completing this require pulling current market data, or just reasoning? */
  dataNeed: DataNeed;
  /** The concrete artifact this item must produce (file/record name). */
  deliverable: string;
  /** How we know the item is genuinely done (a verifiable condition, in prose). */
  verification: string;
  /** Optional: this item can only be satisfied by the human operator (real-world action). */
  humanOnly?: boolean;
}

/** Kinds of human gate an operator must clear (only the operator can satisfy these). */
export type GateKind = "none" | "strategic" | "spend" | "identity" | "legal" | "contact" | "wtp-evidence";

/**
 * A gate is a machine-checkable predicate over the typed metrics/state bag, plus
 * human-readable advance/pivot/kill guidance and an optional human-gate kind.
 */
export interface StageGate {
  /**
   * A boolean predicate over the metrics bag, written in a tiny safe expression
   * language (see gate-eval.ts). Example: "paying_clients >= 3 && wtp_confirmed".
   * When it evaluates true, the stage may advance.
   */
  predicate: string;
  /** What advancing means / what good looks like. */
  advance: string;
  /** When to pivot, and to which upstream stage id. */
  pivot: { when: string; toStage: string };
  /** When to kill the idea outright. */
  kill: string;
  /** Human gate required before advancing (operator action), if any. */
  human: GateKind;
}

/** One stage of the idea-to-profitability loop, fully described as data. */
export interface VersionedStage {
  id: string;
  /** Monotonic per-stage version; bumped whenever the meta-loop edits this stage. */
  version: number;
  /** Ordinal position in the sequence (for dependency/ordering and display). */
  order: number;
  title: string;
  /** One-line "what this stage is doing" used for live feedback. */
  intent: string;
  /** Why this stage exists / the principle behind it (for the agent and the spec). */
  rationale: string;
  inputs: string[];
  checklist: ChecklistItem[];
  /** Stage-level deliverables (roll-up of the important artifacts). */
  deliverables: string[];
  gate: StageGate;
  /** Stage ids that must be complete before this stage may start. */
  dependencies: string[];
  /** True if this stage is primarily a marketing motion (for emphasis/never-skip). */
  marketing: boolean;
  /** Free-form provenance: which sources/frameworks this stage encodes. */
  sources: string[];
}

/** The whole framework: a versioned, ordered set of stages. */
export interface LoopSpec {
  /** Spec-level version; bumped on ANY change (new stage, edited stage, removed stage). */
  specVersion: number;
  /** ISO timestamp of last edit. */
  updatedAt: string;
  /** Human/agent-readable note on what changed last (for the archive/lineage). */
  changeNote: string;
  stages: VersionedStage[];
}

/** The typed metrics/state bag a gate predicate is evaluated against. */
export interface MetricsBag {
  // ── Discovery / problem ──
  segments_evaluated?: number;
  problem_severity?: number; // 1-10 (magnitude × frequency)
  icp_defined?: boolean;
  voc_language_captured?: boolean;
  // ── Offer ──
  offer_documented?: boolean;
  guarantee_designed?: boolean;
  gross_margin_pct?: number;
  // ── Channels ──
  channels_brainstormed?: number; // of 19
  channels_ranked?: boolean;
  channels_under_test?: number;
  // ── Assets / build ──
  offering_live?: boolean;
  landing_page_live?: boolean;
  lead_magnet_ready?: boolean;
  tracking_instrumented?: boolean;
  // ── Marketing engine (the new spine) ──
  qualified_leads?: number;
  best_channel_cpl_usd?: number;
  best_channel_optin_pct?: number; // opt-in / waitlist conversion on qualified traffic
  reply_rate_pct?: number;
  qualified_traffic_sufficient?: boolean; // enough volume for a valid WTP read
  // ── Willingness to pay (validated AFTER demand exists) ──
  wtp_confirmed?: boolean; // real payment signals met pre-set threshold
  prepaid_or_deposits?: number;
  paying_clients?: number;
  // ── Economics ──
  ltgp_cac_ratio?: number;
  client_financed?: boolean; // 30-day GP > 2×(CAC+COGS)
  retention_pct?: number;
  default_alive?: boolean;
  mrr_usd?: number;
  // escape hatch for meta-loop-added metrics
  [key: string]: number | boolean | string | undefined;
}
