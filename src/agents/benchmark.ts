// src/agents/benchmark.ts
// Traffic-independent improvement signal: research successful competitors in the
// niche, inspect our OWN built site, compare them across the dimensions that
// drive conversions, and emit a scored gap list + concrete improvement
// directives the next build pass will honor. This is what lets the overnight
// loop keep getting better WITHOUT any live traffic data.

import { resolve } from "node:path";
import { runAgentJson } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ForgeConfig, Phase } from "../lib/types.js";
import { loadDecisions, recordNote, loadState, loadDeployedUrl } from "../harness/memory.js";
import { addDirective } from "../harness/directives.js";
import { recordSpend } from "../harness/budget.js";
import { status } from "../harness/status.js";

export interface BenchmarkResult {
  /** 0-100 self-assessed quality of our site vs the best competitors. */
  score: number;
  competitorsReviewed: string[];
  /** Concrete, prioritized improvements; each becomes a directive at its phase. */
  improvements: Array<{
    area:
      | "positioning"
      | "audience"
      | "market"
      | "offer"
      | "pricing"
      | "stack"
      | "design"
      | "copy"
      | "cta"
      | "funnel"
      | "social-proof"
      | "performance"
      | "other";
    change: string;
    why: string;
    impact: "high" | "medium" | "low";
  }>;
  /** Problems found on the LIVE deployed site (if validated). */
  liveIssues?: string[];
  /** True when the site is competitive and no material gaps remain. */
  converged: boolean;
}

/** Which pipeline phase an improvement area cascades from. */
function phaseForArea(area: string): Phase {
  if (area === "positioning" || area === "audience" || area === "market") return "research";
  if (area === "offer" || area === "pricing" || area === "stack") return "decide";
  return "build";
}

const OUT = () => resolve(process.cwd(), "memory/benchmark");

/** Returns the benchmark result PLUS the earliest phase its improvements touch. */
export async function runBenchmark(cfg: ForgeConfig): Promise<BenchmarkResult & { earliestPhase: Phase | null }> {
  status.start("benchmark", "Comparing our site against successful competitors…");
  recordNote(loadState(), "optimize", "Benchmark pass started (competitor comparison).");

  const siteDir = resolve(process.cwd(), "site/scaffold");
  const decisions = loadDecisions();
  const positioning =
    decisions.find((d) => /position|value/i.test(d.id))?.recommendation ?? `${cfg.brief.niche} (${cfg.brief.goal})`;

  // Resolve the live URL: an explicit FORGE_SITE_URL wins (e.g. a custom domain),
  // otherwise use the URL captured automatically at deploy time.
  const liveUrl = cfg.siteUrl || loadDeployedUrl();
  const liveBlock = liveUrl
    ? `\nSTEP 0 — Our site is deployed at ${liveUrl}. Fetch it and verify it loads, the lead-capture ` +
      `form is present and wired, and there are no obvious breakages. Report anything wrong in liveIssues[].\n`
    : "";

  const { data, meta } = await runAgentJson<BenchmarkResult>({
    cfg,
    model: cfg.models.lead,
    label: "benchmark",
    intent: "researching competitors -> comparing our site -> finding concrete improvements",
    systemPrompt: prompt("benchmarker"),
    permissionMode: "acceptEdits",
    cwd: siteDir,
    allowedTools: ["WebSearch", "WebFetch", "Read", "Glob", "Grep"],
    prompt:
      `Our venture: ${cfg.brief.niche} - ${cfg.brief.goal}\nPositioning: ${positioning}\n` +
      liveBlock +
      "\nSTEP 1 - Find 3-5 genuinely successful competitors / best-in-class lead-capture sites in this " +
      "space (use web search; prefer ones known for strong conversion). Note what each does well across " +
      "BOTH strategy (positioning, audience, offer, pricing) AND execution (headline, social proof, funnel, design, CTA).\n" +
      "STEP 2 - Read OUR site in this directory and assess it honestly against them - strategy and execution alike. " +
      "Don't limit yourself to visual polish: if our POSITIONING, AUDIENCE, or OFFER is weaker than competitors', say so " +
      "(those are the highest-leverage fixes and should be flagged even though they mean deeper rework).\n" +
      "STEP 3 - Produce a scored comparison and a PRIORITIZED improvement list. Use the right `area` for each so it " +
      "routes to the correct stage (positioning/audience/market are strategic; offer/pricing/stack are decisions; " +
      "design/copy/cta/funnel/social-proof/performance are build). Mark converged:true only if genuinely competitive.\n\n" +
      "Return ONLY JSON: {score, competitorsReviewed[], improvements[{area,change,why,impact}], liveIssues[], converged}.",
  });
  recordSpend(cfg, meta.costUsd);

  const path = resolve(OUT(), `benchmark-${Date.now()}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));

  const actionable = (data.improvements ?? []).filter((i) => i.impact !== "low");
  let earliest: Phase | null = null;
  const order: Phase[] = ["research", "decide", "build", "deploy", "optimize"];
  for (const imp of actionable) {
    const ph = phaseForArea(imp.area);
    addDirective(`[${imp.area}] ${imp.change} (competitor insight: ${imp.why})`, ph);
    if (!earliest || order.indexOf(ph) < order.indexOf(earliest)) earliest = ph;
  }
  for (const issue of data.liveIssues ?? []) {
    addDirective(`[live-fix] Deployed site issue to fix: ${issue}`, "build");
    if (!earliest || order.indexOf("build") < order.indexOf(earliest)) earliest = "build";
  }

  log.ok(
    "benchmark",
    `Score ${data.score}/100 vs ${data.competitorsReviewed?.length ?? 0} competitors. ` +
      `${actionable.length} improvement(s) queued${earliest ? ` (deepest: ${earliest})` : ""}. ` +
      `${(data.liveIssues ?? []).length} live issue(s). ${data.converged ? "Converged." : ""}`
  );
  return { ...data, earliestPhase: earliest };
}
