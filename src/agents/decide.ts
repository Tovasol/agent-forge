// src/agents/decide.ts
// Phase 2: convert cited findings into weighted, scored decision artifacts.

import { runAgentJson } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig, Decision, Finding } from "../lib/types.js";
import {
  loadState,
  recordNote,
  saveDecision,
  loadFindings,
  loadDecisions,
} from "../harness/memory.js";
import { recordSpend } from "../harness/budget.js";

const MAX_REVISIONS = 2;

async function decide(cfg: ForgeConfig, findings: Finding[]): Promise<Decision[]> {
  const { data, meta } = await runAgentJson<Decision[]>({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("decider"),
    label: "decide:options",
    permissionMode: "plan",
    allowedTools: ["WebSearch", "WebFetch"],
    prompt:
      "From these cited findings, produce the key business decisions as scored comparison tables. " +
      "Cover at minimum: positioning/value-prop, the lead magnet, the funnel shape, and the frugal service stack " +
      "(ESP, CRM, database, hosting, analytics). " +
      "Operator stack to prefer: " +
      cfg.brief.services.join(", ") +
      `. Monthly budget: $${cfg.brief.monthlyBudgetUsd}.\n\nFINDINGS:\n` +
      JSON.stringify(findings, null, 2) +
      "\n\nReturn ONLY the decisions JSON array.",
  });
  recordSpend(cfg, meta.costUsd);
  return data;
}

async function critique(cfg: ForgeConfig, decisions: Decision[]) {
  const { data, meta } = await runAgentJson<{
    verdict: "pass" | "revise";
    score: number;
    gaps: string[];
    instructions: string;
  }>({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("critic"),
    label: "decide:critic",
    permissionMode: "plan",
    allowedTools: [],
    prompt:
      "Evaluate these decision artifacts. Check that every option is cited, costs are realistic at volume, " +
      "strong frugal alternatives weren't missed, and recommendations fit the operator stack.\n\n" +
      JSON.stringify(decisions, null, 2) +
      "\n\nReturn ONLY the critic JSON.",
  });
  recordSpend(cfg, meta.costUsd);
  return data;
}

export async function runDecidePhase(cfg: ForgeConfig): Promise<Decision[]> {
  const state = loadState();
  state.currentPhase = "decide";
  recordNote(state, "decide", "Decision phase started.");

  const findings = loadFindings();
  if (!findings.length) {
    throw new Error("No findings found. Run the research phase first.");
  }

  let decisions: Decision[] = [];
  let guidance = "";
  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    log.step("decide", `Producing decisions (attempt ${attempt + 1})…`);
    const findingsForRun = guidance
      ? findings.concat([
          {
            workerId: "_critic_guidance",
            summary: guidance,
            claims: [],
            implications: [],
            nextActions: [],
            openQuestions: [],
          } as Finding,
        ])
      : findings;
    decisions = await decide(cfg, findingsForRun);

    const verdict = await critique(cfg, decisions);
    log.info("critic", `verdict=${verdict.verdict} score=${verdict.score}`);
    if (verdict.verdict === "pass" || attempt === MAX_REVISIONS) break;
    guidance = verdict.instructions;
    log.warn("decide", "Critic requested revision: " + verdict.instructions);
  }

  for (const d of decisions) saveDecision(d);
  recordNote(loadState(), "decide", `Saved ${decisions.length} decisions.`);
  log.ok("decide", `Decisions saved: ${decisions.map((d) => d.id).join(", ")}`);
  return loadDecisions();
}
