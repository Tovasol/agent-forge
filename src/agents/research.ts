// src/agents/research.ts
// Phase 1: deep market research via orchestrator -> parallel workers -> critic.

import pLimitless from "../lib/concurrency.js";
import { runAgent, runAgentJson } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig, WorkerSpec, Finding, SourceRecord, ResearchSynthesis } from "../lib/types.js";
import {
  loadState,
  recordNote,
  saveFinding,
  loadFindings,
  deleteFinding,
  appendSources,
  loadSourceUrls,
  saveSynthesis,
} from "../harness/memory.js";
import { recordSpend } from "../harness/budget.js";
import { status } from "../harness/status.js";



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
  log.step("research", "Scoping the venture, then deciding the research decomposition…");
  const { data, meta } = await runAgentJson<WorkerSpec[]>({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("orchestrator"),
    label: "research:plan",
    permissionMode: "plan",
    allowedTools: ["WebSearch", "WebFetch"],
    prompt:
      briefBlock(cfg) +
      "\n\nFirst, briefly scope THIS specific venture. Then decompose the research into as many " +
      "decision-critical facets as the topic genuinely needs — NO fixed number. Scale to complexity: " +
      "a simple, well-understood offering may need only a few facets; a novel or multi-sided one may need many. " +
      "Each facet must be a distinct, non-overlapping area whose findings will drive a real decision " +
      "(typical areas include market/ICP & positioning, competitor/offer teardown, lead-magnet formats, " +
      "the frugal service/tooling stack, funnel & conversion, pricing, channels, regulatory/risk — but " +
      "include only those that matter for THIS venture, and add venture-specific ones the list misses). " +
      `Do not exceed ${cfg.maxResearchWorkers} facets (a hard ceiling, not a target — use fewer if that's all the topic needs). ` +
      "For each facet give a one-line justification of why its research is decision-critical. " +
      "Return ONLY a JSON array of workers: " +
      `[{"id":"kebab-id","title":"...","objective":"<incl. why this is decision-critical>","questions":["..."],"outputFile":"memory/findings/<id>.json"}]`,
  });
  recordSpend(cfg, meta.costUsd);
  // Bound by the ceiling only — the COUNT is the planner's topic-driven choice.
  const specs = data
    .slice(0, cfg.maxResearchWorkers)
    .map((w) => ({ ...w, outputFile: `memory/findings/${w.id}.json` }));
  log.ok("research", `Planned ${specs.length} facet(s) for this venture: ${specs.map((s) => s.id).join(", ")}`);
  status.setFacets(specs.map((s) => ({ id: s.id, title: s.title })));
  return specs;
}

async function runWorker(cfg: ForgeConfig, spec: WorkerSpec): Promise<Finding> {
  log.step("worker:" + spec.id, spec.title);
  status.facet(spec.id, { state: "researching", startedAt: new Date().toISOString() });
  const ask =
    `WORKER ID: ${spec.id}\nOBJECTIVE: ${spec.objective}\n` +
    `QUESTIONS:\n` +
    spec.questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n") +
    `\n\nContext:\n${briefBlock(cfg)}\n\nReturn ONLY the findings JSON.`;
  const { data, meta } = await runAgentJson<Finding>({
    cfg,
    model: cfg.models.worker,
    systemPrompt: prompt("worker"),
    label: "research:worker",
    permissionMode: "plan",
    allowedTools: ["WebSearch", "WebFetch"],
    prompt: ask,
    onActivity: (a) => {
      const icon = a.kind === "search" ? "🔍" : a.kind === "fetch" ? "🌐" : "⚙";
      log.activity(spec.id, `${icon} ${a.kind}: ${a.detail}`);
      status.activity(`[${spec.id}] ${icon} ${a.kind}: ${a.detail}`);
      if (a.kind === "search") status.bumpSearch(spec.id);
    },
  });
  recordSpend(cfg, meta.costUsd);
  data.workerId = spec.id;
  saveFinding(data);
  const records: SourceRecord[] = (data.claims ?? [])
    .filter((c) => c.evidenceUrl && /^https?:\/\//.test(c.evidenceUrl))
    .map((c) => ({ url: c.evidenceUrl, facet: spec.id, snippet: c.statement.slice(0, 240), fetchedAt: new Date().toISOString() }));
  appendSources(records);
  status.facet(spec.id, { state: "done", claims: data.claims?.length ?? 0, finishedAt: new Date().toISOString() });
  log.ok(
    "worker:" + spec.id,
    `${data.claims?.length ?? 0} claims, ${data.nextActions?.length ?? 0} actions, ${data.openQuestions?.length ?? 0} open`
  );
  return data;
}

async function critique(cfg: ForgeConfig, findings: Finding[]) {
  // Pass a COMPACT projection, not full findings, so the critic's context stays
  // bounded as research accumulates (distill, don't dump).
  const compact = findings.map((f) => ({
    workerId: f.workerId,
    summary: f.summary,
    claimCount: f.claims?.length ?? 0,
    sampleClaims: (f.claims ?? []).slice(0, 6).map((c) => c.statement),
    implications: f.implications ?? [],
    openQuestions: f.openQuestions ?? [],
  }));
  const { data, meta } = await runAgentJson<{
    verdict: "pass" | "revise";
    score: number;
    gaps: string[];
    instructions: string;
    missingAreas?: Array<{ id: string; title: string; objective: string; questions: string[] }>;
    saturated?: boolean;
    saturationNote?: string;
  }>({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("critic"),
    label: "research:critic",
    permissionMode: "plan",
    allowedTools: [],
    prompt:
      "Evaluate these research findings for citation quality, cost realism, COVERAGE " +
      "(is any decision-critical area entirely missing?), and SATURATION (has new decision-relevant " +
      "information stopped arriving for this venture's decisions?).\n\n" +
      JSON.stringify(compact, null, 2) +
      "\n\nReturn ONLY the critic JSON.",
  });
  recordSpend(cfg, meta.costUsd);
  return data;
}

// Distinct-claim novelty across rounds: a deterministic backstop so the loop
// can't keep spinning while adding nothing new, even if the critic mis-judges.
function countNewClaims(findings: Finding[], seen: Set<string>): number {
  let added = 0;
  for (const f of findings) {
    for (const c of f.claims ?? []) {
      const key = c.statement.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
      if (key && !seen.has(key)) { seen.add(key); added++; }
    }
  }
  return added;
}

async function synthesize(cfg: ForgeConfig, findings: Finding[], saturationNote: string): Promise<void> {
  try {
    const compact = findings.map((f) => ({
      facet: f.workerId,
      summary: f.summary,
      topClaims: (f.claims ?? []).slice(0, 8).map((c) => c.statement),
      implications: f.implications ?? [],
      nextActions: f.nextActions ?? [],
    }));
    const { data, meta } = await runAgentJson<Omit<ResearchSynthesis, "builtAt" | "saturationNote">>({
      cfg,
      model: cfg.models.lead,
      systemPrompt: prompt("synthesizer"),
      label: "research:synthesize",
      permissionMode: "plan",
      allowedTools: [],
      prompt:
        "Synthesize these distilled facet findings into a decision-grade brief.\n\n" +
        JSON.stringify(compact, null, 2) +
        "\n\nReturn ONLY the synthesis JSON.",
    });
    recordSpend(cfg, meta.costUsd);
    saveSynthesis({ ...data, builtAt: new Date().toISOString(), saturationNote });
    log.ok("synthesis", `${data.conclusions?.length ?? 0} conclusions, ${data.nextActions?.length ?? 0} next actions → memory/research/synthesis.md`);
  } catch (e) {
    log.warn("synthesis", `Could not synthesize (${(e as Error).message}); raw findings remain in memory/findings/.`);
  }
}

export async function runResearchPhase(cfg: ForgeConfig): Promise<Finding[]> {
  const state = loadState();
  state.currentPhase = "research";
  recordNote(state, "research", "Research phase started.");
  status.start("research", "Scoping the venture and decomposing research…");

  const limit = pLimitless(cfg.maxParallelWorkers);
  let specs = await plan(cfg);

  async function runBatch(toRun: WorkerSpec[]): Promise<void> {
    const results = await Promise.allSettled(toRun.map((s) => limit(() => runWorker(cfg, s))));
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        status.facet(toRun[i].id, { state: "failed" });
        log.error("worker:" + toRun[i].id, `Failed after retries: ${String(r.reason).slice(0, 100)}`);
      }
    });
  }

  let findings: Finding[] = [];
  const seenClaims = new Set<string>();
  let stopReason = "";

  for (let round = 0; round <= cfg.maxResearchRounds; round++) {
    const done = new Set(loadFindings().map((f) => f.workerId));
    const todo = specs.filter((s) => !done.has(s.id));
    if (todo.length) {
      log.step(
        "research",
        `Round ${round + 1}: running ${todo.length} facet(s), max ${cfg.maxParallelWorkers} in parallel… ` +
          `(saturation-driven; ceiling ${cfg.maxResearchWorkers} facets / ${cfg.maxResearchRounds + 1} rounds is a backstop)`
      );
      await runBatch(todo);
    }

    findings = loadFindings();
    if (!findings.length) {
      recordNote(loadState(), "research", "All research workers failed. Stopping so you can retry/resume.");
      log.error("research", "All workers failed. Re-run `npm run research` to retry (saved facets are skipped).");
      return [];
    }

    // How much NEW material did this round actually add? (deterministic backstop)
    const newClaims = countNewClaims(findings, seenClaims);
    const novelty = seenClaims.size ? newClaims / seenClaims.size : 1;

    const verdict = await critique(cfg, findings);
    const missing = (verdict.missingAreas ?? []).filter(
      (m) => m.id && !specs.some((s) => s.id === m.id) && !done.has(m.id)
    );
    log.info(
      "critic",
      `verdict=${verdict.verdict} score=${verdict.score} saturated=${verdict.saturated ?? false} ` +
        `newClaims=${newClaims} (novelty ${(novelty * 100).toFixed(0)}%)` +
        (missing.length ? ` · missing: ${missing.map((m) => m.id).join(", ")}` : "")
    );

    // ── PRIMARY STOP: saturation ──────────────────────────────────────────────
    // Stop when the topic's decision-critical ground is covered: the critic says
    // saturated, nothing is missing, AND little/no new material arrived this round.
    const lowNovelty = round > 0 && newClaims <= 2; // almost nothing new came in
    if (!missing.length && (verdict.saturated || (verdict.verdict === "pass" && lowNovelty))) {
      stopReason = verdict.saturated
        ? "Coverage saturated — new decision-relevant information had stopped arriving."
        : "Accepted — coverage complete and new information had tapered off.";
      recordNote(loadState(), "research", stopReason);
      break;
    }

    // ── BACKSTOPS (circuit breakers, should rarely decide the outcome) ─────────
    const room = cfg.maxResearchWorkers - specs.length;
    if (round === cfg.maxResearchRounds) {
      stopReason = `Stopped at the round backstop (${cfg.maxResearchRounds + 1} rounds). Coverage may be partial.`;
      recordNote(loadState(), "research", stopReason);
      break;
    }
    if (missing.length && room <= 0) {
      stopReason = `Stopped at the facet-ceiling backstop (${cfg.maxResearchWorkers}). Some areas left unexplored: ${missing.map((m) => m.id).join(", ")}.`;
      recordNote(loadState(), "research", stopReason);
      log.warn("research", stopReason + " Raise FORGE_MAX_RESEARCH_WORKERS to go deeper.");
      break;
    }

    // ── KEEP GOING: close gaps (saturation not yet reached) ────────────────────
    if (missing.length && room > 0) {
      const toAdd = missing.slice(0, room).map((m) => ({
        id: m.id,
        title: m.title,
        objective: m.objective,
        questions: m.questions ?? [],
        outputFile: `memory/findings/${m.id}.json`,
      }));
      specs = specs.concat(toAdd);
      for (const t of toAdd) status.addFacet({ id: t.id, title: t.title });
      log.warn("research", `Not saturated — fanning out further: +${toAdd.length} new facet(s) the critic found missing.`);
    } else if (verdict.verdict === "revise") {
      log.warn("research", "Not saturated — deepening existing facets with sharper objectives.");
      for (const s of specs) s.objective += `\n\nREVISION GUIDANCE: ${verdict.instructions}`;
      for (const s of specs) deleteFinding(s.id);
    } else {
      // pass, no missing, but novelty still high and not flagged saturated:
      // accept rather than spin.
      stopReason = "Accepted — critic passed and no missing areas remained.";
      recordNote(loadState(), "research", stopReason);
      break;
    }
  }

  // Distill everything into the synthesis the rest of the pipeline consumes.
  await synthesize(cfg, findings, stopReason || "Stopped.");

  log.ok(
    "research",
    `Research complete: ${findings.length} facet finding(s), ${loadSourceUrls().size} unique source(s) cached. ${stopReason}`
  );
  return loadFindings();
}
