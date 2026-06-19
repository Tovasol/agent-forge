// src/agents/research.ts
// Phase 1: deep market research via orchestrator -> parallel workers -> critic.

import pLimitless from "../lib/concurrency.js";
import { runAgent, runAgentJson } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig, WorkerSpec, Finding } from "../lib/types.js";
import {
  loadState,
  recordNote,
  saveFinding,
  loadFindings,
} from "../harness/memory.js";
import { recordSpend } from "../harness/budget.js";

const MAX_REVISIONS = 2;

function briefBlock(cfg: ForgeConfig): string {
  const b = cfg.brief;
  return [
    `BUSINESS: ${b.businessName}`,
    `NICHE: ${b.niche}`,
    `IDEAL CUSTOMER: ${b.icp || "(infer a sensible ICP and state your assumption)"}`,
    `MONTHLY BUDGET: $${b.monthlyBudgetUsd}`,
    `OPERATOR STACK: ${b.services.join(", ")}`,
    `GOAL: ${b.goal}`,
    b.notes ? `NOTES: ${b.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function plan(cfg: ForgeConfig): Promise<WorkerSpec[]> {
  log.step("research", "Planning research workers…");
  const { data, meta } = await runAgentJson<WorkerSpec[]>({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("orchestrator"),
    permissionMode: "plan",
    allowedTools: ["WebSearch", "WebFetch"],
    prompt:
      briefBlock(cfg) +
      "\n\nDecompose this into 3–5 research workers, one per decision-critical facet " +
      "(e.g. market/ICP & positioning, competitor copy, lead-magnet formats, frugal service stack " +
      "[ESP/CRM/db/hosting/analytics], funnel & conversion best practices). " +
      "Return ONLY a JSON array of workers: " +
      `[{"id":"kebab-id","title":"...","objective":"...","questions":["..."],"outputFile":"memory/findings/<id>.json"}]`,
  });
  recordSpend(cfg, meta.costUsd);
  const specs = data
    .slice(0, cfg.maxParallelWorkers + 1)
    .map((w) => ({ ...w, outputFile: `memory/findings/${w.id}.json` }));
  log.ok("research", `Planned ${specs.length} workers: ${specs.map((s) => s.id).join(", ")}`);
  return specs;
}

async function runWorker(cfg: ForgeConfig, spec: WorkerSpec): Promise<Finding> {
  log.step("worker:" + spec.id, spec.title);
  const ask =
    `WORKER ID: ${spec.id}\nOBJECTIVE: ${spec.objective}\n` +
    `QUESTIONS:\n` +
    spec.questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n") +
    `\n\nContext:\n${briefBlock(cfg)}\n\nReturn ONLY the findings JSON.`;
  const { data, meta } = await runAgentJson<Finding>({
    cfg,
    model: cfg.models.worker,
    systemPrompt: prompt("worker"),
    permissionMode: "plan",
    allowedTools: ["WebSearch", "WebFetch"],
    prompt: ask,
  });
  recordSpend(cfg, meta.costUsd);
  data.workerId = spec.id;
  saveFinding(data);
  log.ok("worker:" + spec.id, `${data.claims?.length ?? 0} claims, ${data.openQuestions?.length ?? 0} open`);
  return data;
}

async function critique(cfg: ForgeConfig, findings: Finding[]) {
  const { data, meta } = await runAgentJson<{
    verdict: "pass" | "revise";
    score: number;
    gaps: string[];
    instructions: string;
  }>({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("critic"),
    permissionMode: "plan",
    allowedTools: [],
    prompt:
      "Evaluate these research findings for citation quality, coverage, and cost realism.\n\n" +
      JSON.stringify(findings, null, 2) +
      "\n\nReturn ONLY the critic JSON.",
  });
  recordSpend(cfg, meta.costUsd);
  return data;
}

export async function runResearchPhase(cfg: ForgeConfig): Promise<Finding[]> {
  const state = loadState();
  state.currentPhase = "research";
  recordNote(state, "research", "Research phase started.");

  const limit = pLimitless(cfg.maxParallelWorkers);
  const specs = await plan(cfg);

  let findings: Finding[] = [];
  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    // Checkpoint resume: skip workers whose findings are already saved (e.g.
    // after an earlier crash), unless we're in a revision pass.
    const alreadyDone = new Set(loadFindings().map((f) => f.workerId));
    const todo = attempt === 0 ? specs.filter((s) => !alreadyDone.has(s.id)) : specs;
    if (todo.length < specs.length) {
      log.info("research", `Resuming: ${specs.length - todo.length} worker(s) already saved, running ${todo.length}.`);
    }
    log.step("research", `Running ${todo.length} worker(s), max ${cfg.maxParallelWorkers} in parallel (attempt ${attempt + 1})…`);

    // allSettled so one worker failing doesn't abort the others.
    const results = await Promise.allSettled(todo.map((s) => limit(() => runWorker(cfg, s))));
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        failed.push(todo[i].id);
        log.error("worker:" + todo[i].id, `Failed after retries: ${String(r.reason).slice(0, 100)}`);
      }
    });

    // Findings = everything saved so far (succeeded this pass + prior).
    findings = loadFindings();
    if (failed.length) {
      log.warn(
        "research",
        `${failed.length}/${todo.length} worker(s) failed: ${failed.join(", ")}. Continuing with ${findings.length} finding(s).`
      );
    }

    if (!findings.length) {
      // Nothing succeeded at all — surface clearly instead of proceeding empty.
      recordNote(loadState(), "research", "All research workers failed. Stopping so you can retry/resume.");
      log.error("research", "All workers failed. Run `npm run research` again to retry the missing ones (saved ones are skipped).");
      return [];
    }

    const verdict = await critique(cfg, findings);
    log.info("critic", `verdict=${verdict.verdict} score=${verdict.score}`);
    if (verdict.verdict === "pass" || attempt === MAX_REVISIONS) {
      recordNote(loadState(), "research", `Research accepted (score ${verdict.score}, ${findings.length} findings).`);
      break;
    }
    // Sharpen the weakest workers using the critic's instructions.
    log.warn("research", "Critic requested revision. Re-running with sharper objectives.");
    for (const s of specs) {
      s.objective += `\n\nREVISION GUIDANCE: ${verdict.instructions}`;
    }
  }

  log.ok("research", `Research complete: ${findings.length} findings saved.`);
  return loadFindings();
}
