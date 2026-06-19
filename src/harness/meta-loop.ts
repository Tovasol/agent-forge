// src/harness/meta-loop.ts
// The OUTER self-improving loop: it watches outcomes of idea-runs and improves
// the INNER framework (the versioned loop spec) over time, then re-runs only the
// phases that changed. Built as evaluator-optimizer + Reflexion-style reflection,
// with DGM-grade guardrails so it can't degrade or game the framework.
//
// GUARDRAILS (critical — from the research's documented objective-hacking failure):
//   1. HIDDEN, UNMODIFIABLE EVALUATOR: the success metrics that judge the framework
//      live HERE, in code, and are NOT part of the editable spec the improver rewrites.
//      The improver proposes process changes; it never gets to define success.
//   2. EMPIRICAL REGRESSION GATE: a proposed spec change must pass a regression suite
//      (structural validity + scenario replays) before it can be accepted.
//   3. ARCHIVE + ROLLBACK: every spec version is archived (loop-spec-store); a bad
//      change is revertible.
//   4. HUMAN APPROVAL (default): changes are proposed and, unless explicitly
//      auto-approved, require operator sign-off before going live.
//   5. TRUE-OUTCOME METRICS: evaluation rewards real progress signals (gates passed
//      honestly, payment evidence, LTGP:CAC) — never proxies like raw lead counts.

import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import type { LoopSpec, VersionedStage, ChecklistItem } from "../lib/loop-schema.js";
import { runAgentJson } from "../lib/agent.js";
import { recordSpend } from "./budget.js";
import { loadSpec, saveSpec, validateSpec, rollbackSpec, listSpecVersions } from "./loop-spec-store.js";
import { listIdeas, episodic, getMetrics, loadIdeaSpec, type IdeaRecord } from "./loop-memory.js";

// ── 1) HIDDEN, UNMODIFIABLE EVALUATOR ────────────────────────────────────────
// This scoring function is the system's protected objective. It is intentionally
// simple, outcome-focused, and lives in code where the improver cannot edit it.
export interface RunScore {
  ideaId: string;
  stagesCompleted: number;
  reachedPayment: boolean; // honest WTP evidence
  reachedProfit: boolean; // default-alive / LTGP:CAC target
  killedEarlyButHonest: boolean; // a fast honest kill is a SUCCESS, not a failure
  score: number; // 0..100, the protected objective
  constraint: string | null; // the stage that most blocked progress
}

export function scoreIdeaRun(idea: IdeaRecord): RunScore {
  const m = getMetrics(idea.id);
  const spec = loadIdeaSpec(idea.id);
  const total = spec.stages.length;
  const completed = idea.completedStages.length;
  const reachedPayment = !!m.wtp_confirmed && ((m.paying_clients ?? 0) >= 1 || (m.prepaid_or_deposits ?? 0) >= 1);
  const reachedProfit = !!m.default_alive && (m.ltgp_cac_ratio ?? 0) >= 6;

  // A fast, honest kill (before sinking effort) is a legitimate good outcome.
  const killedEarlyButHonest = idea.status === "killed" && completed <= 3;

  // Protected objective: reward genuine progress toward profit; reward honest early kills;
  // do NOT reward proxy activity. Capped 0..100.
  let score = (completed / total) * 40;
  if (reachedPayment) score += 25;
  if (reachedProfit) score += 35;
  if (killedEarlyButHonest) score = Math.max(score, 55); // honest kills are valuable
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Constraint = the first incomplete stage (the thing that blocked progress).
  const constraint = idea.status === "active"
    ? [...spec.stages].sort((a, b) => a.order - b.order).find((s) => !idea.completedStages.includes(s.id))?.id ?? null
    : null;

  return { ideaId: idea.id, stagesCompleted: completed, reachedPayment, reachedProfit, killedEarlyButHonest, score, constraint };
}

// ── 2) REFLECTION (Reflexion-style verbal lessons) ───────────────────────────
// Turn a run's outcome into durable lessons written to the idea's episodic memory,
// prepended on the next attempt of the constraining stage.
export async function reflectOnRun(cfg: ForgeConfig, idea: IdeaRecord, score: RunScore): Promise<string[]> {
  if (!score.constraint) return [];
  const episodes = episodic(idea.id).all().slice(-40);
  const { data, meta } = await runAgentJson<{ lessons: string[] }>({
    cfg,
    model: cfg.models.lead,
    label: "meta:reflect",
    intent: "diagnosing why the idea stalled and writing lessons",
    systemPrompt:
      "You are a venture post-mortem analyst. Given a run's event log and where it stalled, write 1–3 SPECIFIC, " +
      "actionable lessons that would help a NEXT attempt of the constraining stage do better. Lessons must be " +
      "concrete and process-oriented (what to check/do), not platitudes. Return ONLY JSON {\"lessons\":[...]}.",
    allowedTools: [],
    prompt:
      `Idea: ${idea.hint}\nStalled at stage: ${score.constraint}\nScore: ${score.score}/100\n\n` +
      `Recent events:\n${episodes.map((e) => `- [${e.stage}/${e.kind}] ${e.text}`).join("\n")}\n\n` +
      `Write the lessons.`,
  });
  recordSpend(cfg, meta.costUsd);
  const lessons = (data.lessons ?? []).filter((l) => typeof l === "string" && l.trim());
  for (const l of lessons) episodic(idea.id).add(score.constraint, l, "lesson");
  return lessons;
}

// ── 3) IMPROVER: propose spec changes as structured diffs ────────────────────
export interface SpecChange {
  kind: "add_checklist_item" | "revise_gate_predicate" | "revise_checklist_item";
  stageId: string;
  rationale: string;
  // for add_checklist_item / revise_checklist_item
  item?: ChecklistItem;
  itemId?: string;
  // for revise_gate_predicate
  newPredicate?: string;
}

/**
 * Look across ALL idea-runs, find a recurring constraint, and propose a process
 * improvement to the GLOBAL spec. The improver only proposes structural process
 * changes; it cannot see or alter the protected scoring function above.
 */
export async function proposeImprovement(cfg: ForgeConfig): Promise<SpecChange | null> {
  const ideas = listIdeas();
  if (!ideas.length) {
    log.info("meta", "No idea-runs yet — nothing to learn from.");
    return null;
  }
  const scores = ideas.map((i) => scoreIdeaRun(i));
  // Find the most common constraint stage across runs.
  const tally: Record<string, number> = {};
  for (const s of scores) if (s.constraint) tally[s.constraint] = (tally[s.constraint] ?? 0) + 1;
  const constraint = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!constraint) {
    log.info("meta", "No recurring constraint identified.");
    return null;
  }

  const spec = loadSpec();
  const stage = spec.stages.find((s) => s.id === constraint);
  if (!stage) return null;

  // Gather lessons recorded for this stage across ideas (Reflexion memory feeding the improver).
  const lessons = ideas.flatMap((i) => episodic(i.id).lessonsFor(constraint)).slice(0, 20);

  const { data, meta } = await runAgentJson<SpecChange>({
    cfg,
    model: cfg.models.lead,
    label: "meta:improve",
    intent: `proposing a process improvement to the "${constraint}" stage`,
    systemPrompt:
      "You improve a codified venture framework. Ideas keep stalling at one stage. Propose ONE concrete, " +
      "high-leverage process change to that stage that would help future ideas pass it HONESTLY — never a change " +
      "that merely makes the gate easier to satisfy without real progress (that is forbidden objective-hacking). " +
      "Prefer adding a missing checklist item that addresses the documented failure, or tightening a vague gate. " +
      "Return ONLY JSON matching the SpecChange schema you are given.",
    allowedTools: [],
    prompt:
      `Constraining stage:\n${JSON.stringify(stage, null, 2)}\n\n` +
      `Lessons recorded from real runs at this stage:\n- ${lessons.join("\n- ") || "(none)"}\n\n` +
      `Propose ONE change. Schema:\n` +
      `{"kind":"add_checklist_item"|"revise_gate_predicate"|"revise_checklist_item","stageId":"${constraint}",` +
      `"rationale":"...","item":{"id":"...","text":"...","dataNeed":"live|internal|mixed","deliverable":"...","verification":"..."},` +
      `"itemId":"<for revise>","newPredicate":"<for revise_gate_predicate>"}`,
  });
  recordSpend(cfg, meta.costUsd);
  if (!data?.kind || !data?.stageId) return null;
  log.ok("meta", `Proposed ${data.kind} on "${data.stageId}": ${data.rationale}`);
  return data;
}

// ── 4) APPLY a change behind the regression gate ─────────────────────────────
/** Apply a proposed change to a COPY of the spec and return the candidate (not saved). */
export function applyChangeToSpec(spec: LoopSpec, change: SpecChange): LoopSpec {
  const next: LoopSpec = JSON.parse(JSON.stringify(spec));
  const stage = next.stages.find((s) => s.id === change.stageId);
  if (!stage) return next;
  if (change.kind === "add_checklist_item" && change.item) {
    if (!stage.checklist.some((c) => c.id === change.item!.id)) {
      stage.checklist.push(change.item);
      stage.version++;
    }
  } else if (change.kind === "revise_checklist_item" && change.itemId && change.item) {
    const idx = stage.checklist.findIndex((c) => c.id === change.itemId);
    if (idx >= 0) { stage.checklist[idx] = change.item; stage.version++; }
  } else if (change.kind === "revise_gate_predicate" && change.newPredicate) {
    stage.gate.predicate = change.newPredicate;
    stage.version++;
  }
  return next;
}

// ── 2b) REGRESSION GATE: scenario replays + structural validity ──────────────
// A library of metrics scenarios with the EXPECTED gate outcome per stage. A spec
// change must not break these invariants (e.g., the WTP gate must still REQUIRE
// payment evidence; a profit gate must still require default-alive). This is how
// we catch a change that makes a gate trivially passable (objective-hacking).
import { evalGate } from "../lib/gate-eval.js";

interface Scenario {
  name: string;
  stageId: string;
  metrics: Record<string, number | boolean>;
  expect: boolean;
}

const REGRESSION_SCENARIOS: Scenario[] = [
  // WTP must stay honest: no payment evidence => gate closed.
  { name: "wtp closed without payment", stageId: "wtp", metrics: {}, expect: false },
  { name: "wtp closed with demand but no payment", stageId: "wtp", metrics: { qualified_leads: 500, wtp_confirmed: false }, expect: false },
  { name: "wtp open with real payment", stageId: "wtp", metrics: { wtp_confirmed: true, prepaid_or_deposits: 3 }, expect: true },
  // Profit must require default-alive + ratio.
  { name: "profit closed without default-alive", stageId: "profitability", metrics: { ltgp_cac_ratio: 10, client_financed: true, default_alive: false }, expect: false },
  { name: "profit open when truly default-alive", stageId: "profitability", metrics: { ltgp_cac_ratio: 8, client_financed: true, default_alive: true }, expect: true },
  // Marketing engine must require qualified demand sufficiency.
  { name: "marketing gate closed without leads", stageId: "marketing-engine", metrics: { qualified_traffic_sufficient: false }, expect: false },
];

export function regressionGate(candidate: LoopSpec): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  // (a) structural validity
  const v = validateSpec(candidate);
  if (!v.ok) failures.push(...v.problems.map((p) => `structure: ${p}`));
  // (b) scenario replays — invariants that must hold regardless of edits
  for (const sc of REGRESSION_SCENARIOS) {
    const stage = candidate.stages.find((s) => s.id === sc.stageId);
    if (!stage) continue; // stage may not exist in a custom spec; skip
    const got = evalGate(stage.gate.predicate, sc.metrics);
    if (got !== sc.expect) failures.push(`invariant broken [${sc.name}]: expected ${sc.expect}, got ${got}`);
  }
  return { ok: failures.length === 0, failures };
}

// ── 5) The closed loop: observe → reflect → propose → gate → apply/rollback ───
export interface MetaResult {
  proposed: SpecChange | null;
  accepted: boolean;
  newSpecVersion?: number;
  failures?: string[];
}

/**
 * Run one meta-improvement cycle. By default it REQUIRES human approval before
 * accepting a change (autoApprove only when explicitly set). Even with autoApprove,
 * the regression gate must pass or the change is rejected.
 */
export async function runMetaCycle(cfg: ForgeConfig, opts: { autoApprove?: boolean; approver?: (c: SpecChange) => Promise<boolean> } = {}): Promise<MetaResult> {
  // Reflect on each active/just-finished idea first (writes lessons to memory).
  for (const idea of listIdeas()) {
    const score = scoreIdeaRun(idea);
    if (score.constraint) await reflectOnRun(cfg, idea, score);
  }

  const change = await proposeImprovement(cfg);
  if (!change) return { proposed: null, accepted: false };

  const spec = loadSpec();
  const candidate = applyChangeToSpec(spec, change);

  // REGRESSION GATE — the protected check the improver cannot bypass.
  const gate = regressionGate(candidate);
  if (!gate.ok) {
    log.warn("meta", `Change REJECTED by regression gate:\n- ${gate.failures.join("\n- ")}`);
    return { proposed: change, accepted: false, failures: gate.failures };
  }

  // Human approval (default required).
  let approved = !!opts.autoApprove;
  if (!approved && opts.approver) approved = await opts.approver(change);
  if (!approved) {
    log.info("meta", "Change passed regression but awaits operator approval. Not applied.");
    return { proposed: change, accepted: false };
  }

  const saved = saveSpec(candidate, `meta-loop: ${change.kind} on ${change.stageId} — ${change.rationale}`);
  log.ok("meta", `✓ Accepted change; spec now v${saved.specVersion}. Re-run affected ideas to apply.`);
  return { proposed: change, accepted: true, newSpecVersion: saved.specVersion };
}

/** Roll the global spec back to a prior version (operator safety control). */
export function revertSpec(version: number) {
  return rollbackSpec(version);
}
export function specVersions() {
  return listSpecVersions();
}
