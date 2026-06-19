// src/harness/loop-import.ts
// Bridges the EARLIER pipeline's accumulated work (research findings, synthesis,
// decisions, and any venture-engine state) into a NEW codified-loop idea so the
// loop builds on prior token spend instead of redoing it blindly.
//
// It does two things:
//   1) INGEST: read whatever exists on disk (findings/synthesis/decisions/venture)
//      and fold it into the idea's SEMANTIC facts + EPISODIC log as prior evidence.
//   2) ASSESS: let an agent judge, per stage, whether the imported evidence is
//      strong enough to PRE-COMPLETE that stage (mark its gate satisfied) or
//      whether it's too thin and must be re-run. The judgment is conservative:
//      anything uncertain is left for the loop to do properly.
//
// Nothing is destroyed. The old memory dirs are read-only here; we only add to
// the new idea's namespace under memory/loop/ideas/<id>/.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import type { Finding, ResearchSynthesis, Decision } from "../lib/types.js";
import type { VersionedStage, MetricsBag } from "../lib/loop-schema.js";
import { runAgentJson } from "../lib/agent.js";
import { recordSpend } from "./budget.js";
import {
  loadIdea,
  saveIdea,
  loadIdeaSpec,
  setFact,
  updateMetrics,
  episodic,
  writeArtifact,
  type IdeaRecord,
} from "./loop-memory.js";

const MEM = () => resolve(process.cwd(), "memory");

interface PriorState {
  findings: Finding[];
  synthesis: ResearchSynthesis | null;
  decisions: Decision[];
  ventureJournal: string | null;
  ventureBriefs: unknown[];
  ventureState: any | null;
}

function readJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
  } catch {
    return null;
  }
}

/** Read whatever prior-pipeline state exists on disk (all optional). */
export function readPriorState(): PriorState {
  const findingsDir = resolve(MEM(), "findings");
  const findings: Finding[] = [];
  if (existsSync(findingsDir)) {
    for (const f of readdirSync(findingsDir)) {
      if (f.endsWith(".json")) {
        const rec = readJson<Finding>(resolve(findingsDir, f));
        if (rec) findings.push(rec);
      }
    }
  }
  const decisionsDir = resolve(MEM(), "decisions");
  const decisions: Decision[] = [];
  if (existsSync(decisionsDir)) {
    for (const f of readdirSync(decisionsDir)) {
      if (f.endsWith(".json")) {
        const rec = readJson<Decision>(resolve(decisionsDir, f));
        if (rec) decisions.push(rec);
      }
    }
  }
  const synthesis = readJson<ResearchSynthesis>(resolve(MEM(), "synthesis.json"));

  // Venture engine state (optional)
  const ventureState = readJson<any>(resolve(MEM(), "venture", "state.json"));
  const briefsDir = resolve(MEM(), "venture", "briefs");
  const ventureBriefs: unknown[] = [];
  if (existsSync(briefsDir)) {
    for (const f of readdirSync(briefsDir)) {
      if (f.endsWith(".json")) {
        const rec = readJson<unknown>(resolve(briefsDir, f));
        if (rec) ventureBriefs.push(rec);
      }
    }
  }
  const journalPath = resolve(MEM(), "venture", "journal.md");
  const ventureJournal = existsSync(journalPath) ? readFileSync(journalPath, "utf8") : null;

  return { findings, synthesis, decisions, ventureJournal, ventureBriefs, ventureState };
}

export function priorStateSummary(p: PriorState): string {
  const bits = [
    `${p.findings.length} research finding(s)`,
    p.synthesis ? "a research synthesis" : null,
    `${p.decisions.length} decision(s)`,
    p.ventureState ? "venture-engine state" : null,
    p.ventureBriefs.length ? `${p.ventureBriefs.length} decision brief(s)` : null,
  ].filter(Boolean);
  return bits.join(", ") || "no prior state found";
}

/** Fold prior state into the idea's semantic facts + episodic log as evidence. */
export function ingestPriorState(ideaId: string, p: PriorState): void {
  if (p.findings.length) {
    setFact(ideaId, "prior_findings", p.findings.map((f) => ({ summary: f.summary, claims: f.claims, implications: f.implications })));
    writeArtifact(ideaId, "imported/prior-findings.json", JSON.stringify(p.findings, null, 2));
    episodic(ideaId).add("intake", `Imported ${p.findings.length} prior research finding(s) from the earlier pipeline.`, "event");
  }
  if (p.synthesis) {
    setFact(ideaId, "prior_synthesis", p.synthesis);
    writeArtifact(ideaId, "imported/prior-synthesis.json", JSON.stringify(p.synthesis, null, 2));
    episodic(ideaId).add("intake", `Imported prior research synthesis (${p.synthesis.keyFindings?.length ?? 0} key findings).`, "event");
  }
  if (p.decisions.length) {
    setFact(ideaId, "prior_decisions", p.decisions.map((d) => ({ question: d.question, recommendation: d.recommendation, rationale: d.rationale })));
    writeArtifact(ideaId, "imported/prior-decisions.json", JSON.stringify(p.decisions, null, 2));
    episodic(ideaId).add("intake", `Imported ${p.decisions.length} prior decision(s) — treated as binding unless re-opened.`, "event");
  }
  if (p.ventureBriefs.length) {
    writeArtifact(ideaId, "imported/venture-briefs.json", JSON.stringify(p.ventureBriefs, null, 2));
  }
  if (p.ventureJournal) {
    writeArtifact(ideaId, "imported/venture-journal.md", p.ventureJournal);
    episodic(ideaId).add("intake", "Imported venture-engine journal as historical context.", "event");
  }
  if (p.ventureState) {
    setFact(ideaId, "prior_venture_state", { hint: p.ventureState.hint, currentStage: p.ventureState.currentStage, affordableLossUsd: p.ventureState.affordableLossUsd });
    if (typeof p.ventureState.affordableLossUsd === "number") {
      setFact(ideaId, "affordable_loss_usd", p.ventureState.affordableLossUsd);
    }
  }
}

interface StageAssessment {
  stageId: string;
  sufficient: boolean; // is prior evidence strong enough to PRE-COMPLETE this stage?
  reason: string;
  metricsPatch: MetricsBag; // metrics the prior evidence already establishes
}

/**
 * Ask the agent to judge, per stage, whether imported evidence is strong enough to
 * pre-complete it. Conservative by construction: the prompt instructs it to only
 * mark a stage sufficient when the evidence genuinely meets that stage's bar, and
 * to NEVER claim payment/WTP evidence (those require real operator action).
 */
export async function assessPriorCoverage(
  cfg: ForgeConfig,
  ideaId: string,
  stages: VersionedStage[],
  p: PriorState,
): Promise<StageAssessment[]> {
  const priorBlob = {
    findings: p.findings.map((f) => ({ summary: f.summary, claims: f.claims, implications: f.implications, openQuestions: f.openQuestions })),
    synthesis: p.synthesis,
    decisions: p.decisions.map((d) => ({ question: d.question, recommendation: d.recommendation, rationale: d.rationale })),
    ventureState: p.ventureState ? { currentStage: p.ventureState.currentStage, hint: p.ventureState.hint } : null,
  };

  const stageList = stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => `- ${s.id} (${s.title}): gate = ${s.gate.predicate}; advance = ${s.gate.advance}`)
    .join("\n");

  const { data, meta } = await runAgentJson<{ assessments: StageAssessment[] }>({
    cfg,
    model: cfg.models.lead,
    label: "loop:assess-prior",
    intent: "judging whether prior research/decisions already satisfy each stage",
    systemPrompt:
      "You audit whether ALREADY-EXISTING research and decisions are strong enough to pre-complete stages of a " +
      "venture framework, so the operator doesn't pay to redo solid work. Be CONSERVATIVE and honest: mark a stage " +
      "'sufficient' ONLY if the prior evidence genuinely meets that stage's advance bar. If evidence is thin, generic, " +
      "stale, or missing, mark it NOT sufficient so the loop does it properly. NEVER mark willingness-to-pay, payment, " +
      "or profitability stages sufficient from research alone — those require real operator evidence. Return ONLY JSON.",
    allowedTools: [],
    prompt:
      `PRIOR EVIDENCE (from the operator's earlier runs on their own machine):\n${JSON.stringify(priorBlob, null, 2)}\n\n` +
      `STAGES to assess:\n${stageList}\n\n` +
      `For each stage, decide if the prior evidence is sufficient to pre-complete it. Return ONLY:\n` +
      `{"assessments":[{"stageId":"...","sufficient":true|false,"reason":"...","metricsPatch":{/* metrics prior evidence establishes, e.g. "icp_defined":true,"problem_severity":8 */}}]}`,
  });
  recordSpend(cfg, meta.costUsd);
  return (data.assessments ?? []).filter((a) => a && a.stageId);
}

/**
 * Full bridge: ingest prior state, assess coverage, and PRE-COMPLETE the stages the
 * assessment finds sufficient (recording their metrics and marking them done), then
 * set the idea's current stage to the first stage still needing work.
 */
export async function importPriorWork(cfg: ForgeConfig, ideaId: string): Promise<void> {
  const idea = loadIdea(ideaId);
  if (!idea) {
    log.error("import", `No idea "${ideaId}".`);
    return;
  }
  const prior = readPriorState();
  log.info("import", `Prior state: ${priorStateSummary(prior)}.`);
  if (!prior.findings.length && !prior.synthesis && !prior.decisions.length && !prior.ventureState) {
    log.warn("import", "No prior pipeline state found on disk — nothing to import. The loop will start fresh.");
    return;
  }

  ingestPriorState(ideaId, prior);

  const spec = loadIdeaSpec(ideaId);
  const stages = spec.stages.slice().sort((a, b) => a.order - b.order);
  log.info("import", "Assessing whether prior evidence already satisfies any stages…");
  const assessments = await assessPriorCoverage(cfg, ideaId, stages, prior);

  const completed = new Set(idea.completedStages);
  for (const stage of stages) {
    const a = assessments.find((x) => x.stageId === stage.id);
    if (!a) continue;
    // Apply any metrics the prior evidence establishes regardless.
    if (a.metricsPatch && Object.keys(a.metricsPatch).length) updateMetrics(ideaId, a.metricsPatch);
    if (a.sufficient) {
      completed.add(stage.id);
      episodic(ideaId).add(stage.id, `PRE-COMPLETED from prior evidence: ${a.reason}`, "verdict");
      log.ok("import", `✓ "${stage.title}" pre-completed from prior work — ${a.reason}`);
    } else {
      episodic(ideaId).add(stage.id, `Prior evidence NOT sufficient: ${a.reason}`, "event");
    }
  }

  // Only keep a prefix of completed stages that is contiguous from the start —
  // we don't want a later stage "done" while an earlier one isn't (dependencies).
  const ordered = stages.map((s) => s.id);
  const contiguous: string[] = [];
  for (const id of ordered) {
    if (completed.has(id)) contiguous.push(id);
    else break;
  }
  idea.completedStages = contiguous;
  idea.currentStage = ordered.find((id) => !contiguous.includes(id)) ?? ordered[ordered.length - 1];
  saveIdea(idea);

  log.ok(
    "import",
    `Bridged prior work. Pre-completed ${contiguous.length} stage(s); resuming at "${idea.currentStage}". ` +
      `Run: npm run forge -- idea run ${ideaId}`,
  );
}
