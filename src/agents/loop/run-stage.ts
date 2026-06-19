// src/agents/loop/run-stage.ts
// Runs ONE codified-loop stage for a specific idea: it hands the agent the
// stage's checklist (each item with its deliverable + verification + data-need),
// the idea's accumulated semantic facts and episodic lessons, and asks it to
// complete each item, produce artifacts, and report a typed METRICS PATCH that
// the gate predicate will be evaluated against. Live-tagged items get web tools.

import { runAgentJson } from "../../lib/agent.js";
import { log } from "../../lib/log.js";
import { status } from "../../harness/status.js";
import { recordSpend } from "../../harness/budget.js";
import type { ForgeConfig } from "../../lib/types.js";
import type { VersionedStage, MetricsBag } from "../../lib/loop-schema.js";
import {
  getFacts,
  getMetrics,
  updateMetrics,
  setFact,
  episodic,
  writeArtifact,
} from "../../harness/loop-memory.js";

interface StageRunResult {
  summary: string;
  metricsPatch: MetricsBag;
  factsLearned: Record<string, unknown>;
  artifacts: Array<{ name: string; content: string }>;
  openItems: string[];
  /** Items the agent could NOT complete because they require operator real-world action. */
  blockedOnHuman: string[];
}

const SYS = `You are an expert venture operator-analyst executing ONE stage of a codified
idea-to-profitability framework for a solo bootstrapper. You are rigorous, honest, and
concrete. You complete each checklist item to its named deliverable and verify it. You NEVER
fabricate evidence (especially payment/willingness-to-pay): if an item needs real-world
operator action you cannot perform, you mark it blocked rather than inventing a result.
You report a typed metrics patch reflecting ONLY what is genuinely established. Return ONLY JSON.`;

export async function runLoopStage(
  cfg: ForgeConfig,
  ideaId: string,
  ideaHint: string,
  stage: VersionedStage,
): Promise<StageRunResult> {
  status.start(`loop:${stage.id}`, stage.intent);
  const facts = getFacts(ideaId);
  const metrics = getMetrics(ideaId);
  const lessons = episodic(ideaId).lessonsFor(stage.id);
  const needsLive = stage.checklist.some((c) => c.dataNeed === "live" || c.dataNeed === "mixed");

  const checklistBlock = stage.checklist
    .map(
      (c, i) =>
        `${i + 1}. [${c.dataNeed}] ${c.text}\n   deliverable: ${c.deliverable}\n   verification: ${c.verification}${c.humanOnly ? "\n   (REQUIRES OPERATOR REAL-WORLD ACTION — if you lack evidence, mark blocked)" : ""}`,
    )
    .join("\n");

  const ask =
    `IDEA: ${ideaHint}\n\n` +
    `STAGE: ${stage.title}\nINTENT: ${stage.intent}\nWHY: ${stage.rationale}\n\n` +
    `WHAT IS ALREADY KNOWN (semantic facts):\n${JSON.stringify(facts, null, 2)}\n\n` +
    `CURRENT METRICS:\n${JSON.stringify(metrics, null, 2)}\n\n` +
    (lessons.length ? `LESSONS FROM PRIOR ATTEMPTS (apply these):\n- ${lessons.join("\n- ")}\n\n` : "") +
    `CHECKLIST (complete each to its deliverable, then verify):\n${checklistBlock}\n\n` +
    `The gate to advance is: ${stage.gate.predicate}\n` +
    `Advance means: ${stage.gate.advance}\n\n` +
    `Do the work now (use web search/fetch for [live] and [mixed] items to ground in CURRENT market data). ` +
    `For each checklist item, produce its deliverable as an artifact. Then return ONLY this JSON:\n` +
    `{\n` +
    `  "summary": "<what you did and concluded, honestly>",\n` +
    `  "artifacts": [{"name": "<deliverable filename>", "content": "<full markdown/json content>"}],\n` +
    `  "metricsPatch": { /* ONLY metrics you genuinely established, typed booleans/numbers, e.g. "icp_defined": true, "problem_severity": 8 */ },\n` +
    `  "factsLearned": { /* durable facts about THIS idea worth remembering, e.g. "icp": "...", "top_channel": "..." */ },\n` +
    `  "openItems": ["<unfinished or uncertain item>"],\n` +
    `  "blockedOnHuman": ["<item that needs operator real-world action you could not perform>"]\n` +
    `}`;

  const { data, meta } = await runAgentJson<StageRunResult>({
    cfg,
    model: cfg.models.lead,
    label: `loop:${stage.id}`,
    intent: stage.intent,
    systemPrompt: SYS,
    permissionMode: "acceptEdits",
    allowedTools: needsLive ? ["WebSearch", "WebFetch", "Read", "Glob", "Grep"] : ["Read", "Glob", "Grep"],
    prompt: ask,
  });
  recordSpend(cfg, meta.costUsd);

  // Persist artifacts, facts, metrics, and an episodic record.
  for (const a of data.artifacts ?? []) {
    if (a?.name && typeof a.content === "string") writeArtifact(ideaId, `${stage.id}/${a.name}`, a.content);
  }
  for (const [k, v] of Object.entries(data.factsLearned ?? {})) setFact(ideaId, k, v);
  if (data.metricsPatch && typeof data.metricsPatch === "object") updateMetrics(ideaId, data.metricsPatch);
  episodic(ideaId).add(stage.id, data.summary ?? "(no summary)", "event");
  for (const m of Object.entries(data.metricsPatch ?? {})) episodic(ideaId).add(stage.id, `metric ${m[0]}=${m[1]}`, "metric");

  return {
    summary: data.summary ?? "",
    metricsPatch: data.metricsPatch ?? {},
    factsLearned: data.factsLearned ?? {},
    artifacts: data.artifacts ?? [],
    openItems: data.openItems ?? [],
    blockedOnHuman: data.blockedOnHuman ?? [],
  };
}
