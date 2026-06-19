// src/agents/build.ts
// Phase 3: the builder agent implements the lead-magnet site against the
// approved decisions, working feature-by-feature in site/scaffold/.

import { resolve } from "node:path";
import { runAgent } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig, Decision } from "../lib/types.js";
import { loadState, recordNote, loadDecisions } from "../harness/memory.js";
import { recordSpend } from "../harness/budget.js";

export async function runBuildPhase(cfg: ForgeConfig): Promise<void> {
  const state = loadState();
  state.currentPhase = "build";
  recordNote(state, "build", "Build phase started.");

  const decisions: Decision[] = loadDecisions();
  if (!decisions.length) {
    throw new Error("No decisions found. Run research + decide first.");
  }

  const siteDir = resolve(process.cwd(), "site/scaffold");
  const decisionsSummary = decisions
    .map((d) => `- ${d.id}: ${d.recommendation} ($${d.options.find((o) => o.name === d.recommendation)?.monthlyCostUsd ?? 0}/mo) — ${d.rationale}`)
    .join("\n");

  log.step("build", "Builder agent implementing the site (feature-by-feature)…");
  const result = await runAgent({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("builder"),
    label: "build",
    permissionMode: "acceptEdits",
    cwd: siteDir,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
    prompt:
      "Implement the lead-magnet site in this directory based on these approved decisions:\n\n" +
      decisionsSummary +
      "\n\nThe stack to use is React + Cloudflare + Google Workspace (Sheets CRM to start). " +
      "Maintain forge-features.json as your checklist. Build the hero, the lead-magnet offer, the capture form, " +
      "the funnel (capture -> email confirmation -> CRM row), and a thank-you/next-step page. " +
      "Verify each feature (npm run build / typecheck) before marking it passes:true. " +
      "Do NOT deploy. Stop when the checklist is green or you need a human decision.",
  });
  recordSpend(cfg, result.costUsd);
  recordNote(loadState(), "build", "Build agent session complete.");
  log.ok("build", "Build session finished. Review site/scaffold and forge-features.json.");
}
