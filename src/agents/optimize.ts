// src/agents/optimize.ts
// Phase 5: post-launch optimization. Proposes ONE falsifiable change per pass.
// If a proposal requires spend, it routes through a spend gate.

import { resolve } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { runAgentJson } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import { loadState, recordNote } from "../harness/memory.js";
import { requestGate } from "../harness/gates.js";
import { recordSpend } from "../harness/budget.js";

interface Proposal {
  hypothesis: string;
  change: string;
  rationale: string;
  metric: string;
  successThreshold: string;
  costUsd: number;
  requiresSpend: boolean;
}

function readMetrics(): string {
  const dir = resolve(process.cwd(), "memory/metrics");
  if (!existsSync(dir)) return "(no metrics provided yet — propose based on best practices)";
  const files = readdirSync(dir).filter((f) => !f.startsWith("."));
  if (!files.length) return "(metrics folder empty)";
  return files
    .map((f) => `### ${f}\n` + readFileSync(resolve(dir, f), "utf8").slice(0, 4000))
    .join("\n\n");
}

export async function runOptimizePhase(cfg: ForgeConfig): Promise<void> {
  const state = loadState();
  state.currentPhase = "optimize";
  recordNote(state, "optimize", "Optimize phase started.");

  log.step("optimize", "Forming an optimization hypothesis…");
  const { data, meta } = await runAgentJson<Proposal>({
    cfg,
    model: cfg.models.lead,
    systemPrompt: prompt("optimizer"),
    label: "optimize",
    permissionMode: "plan",
    allowedTools: ["Read", "Glob", "Grep", "WebSearch"],
    prompt:
      "Here is the available performance signal:\n\n" +
      readMetrics() +
      "\n\nPropose exactly ONE change to improve lead conversion. Return ONLY the proposal JSON.",
  });
  recordSpend(cfg, meta.costUsd);

  log.raw(
    `\nProposed optimization:\n  Hypothesis: ${data.hypothesis}\n  Change: ${data.change}\n` +
      `  Metric: ${data.metric}  |  Win: ${data.successThreshold}  |  Cost: $${data.costUsd}\n`
  );

  if (data.requiresSpend && data.costUsd > 0) {
    const ok = await requestGate(cfg.autonomy, {
      kind: "spend",
      phase: "optimize",
      title: "Optimization requires spend",
      detail: `${data.change}\n\nRationale: ${data.rationale}`,
      estimatedCostUsd: data.costUsd,
    });
    if (!ok) {
      log.warn("optimize", "Spend declined. Holding this proposal.");
      return;
    }
  }

  recordNote(loadState(), "optimize", `Proposal: ${data.change}`);
  log.ok(
    "optimize",
    "Proposal recorded. Apply the change (or have the builder apply it), gather data, then re-run optimize."
  );
}
