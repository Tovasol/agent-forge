// src/agents/deploy.ts
// Phase 4: HUMAN-GATED deployment to Cloudflare. This is a spend/deploy gate —
// the loop always stops here for approval before shipping to production.

import { resolve } from "node:path";
import { runAgent } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import { loadState, recordNote } from "../harness/memory.js";
import { requestGate } from "../harness/gates.js";
import { recordSpend } from "../harness/budget.js";

export async function runDeployPhase(cfg: ForgeConfig): Promise<void> {
  const state = loadState();
  state.currentPhase = "deploy";
  recordNote(state, "deploy", "Deploy phase reached.");

  const haveCf = !!(cfg.delivery.cloudflareAccountId && cfg.delivery.cloudflareApiToken);
  const detail = haveCf
    ? "About to deploy the lead-magnet site to your Cloudflare account via Wrangler. " +
      "This publishes a public site and may incur usage on paid tiers."
    : "Cloudflare credentials are NOT set. The agent will print exact deploy steps for you to run, " +
      "rather than deploying automatically.";

  const approved = await requestGate(cfg.autonomy, {
    kind: "deploy",
    phase: "deploy",
    title: "Deploy to Cloudflare?",
    detail,
    estimatedCostUsd: 0,
  });
  if (!approved) {
    log.warn("deploy", "Deployment declined at gate. Nothing shipped.");
    return;
  }

  const siteDir = resolve(process.cwd(), "site/scaffold");

  if (!haveCf) {
    const result = await runAgent({
      cfg,
      model: cfg.models.worker,
      systemPrompt: prompt("builder"),
      label: "deploy",
      permissionMode: "plan",
      cwd: siteDir,
      allowedTools: ["Read", "Glob", "Grep"],
      prompt:
        "Cloudflare credentials are not configured. Produce a precise, copy-pasteable deploy runbook " +
        "for this React + Cloudflare project: wrangler install, login, build, `wrangler deploy`, " +
        "D1/Pages setup if used, and DNS notes. Output as a numbered runbook.",
    });
    recordSpend(cfg, result.costUsd);
    log.raw("\n" + result.text + "\n");
    recordNote(loadState(), "deploy", "Printed manual deploy runbook (no CF creds).");
    return;
  }

  log.step("deploy", "Deploying via Wrangler…");
  const result = await runAgent({
    cfg,
    model: cfg.models.worker,
    systemPrompt: prompt("builder"),
    label: "deploy",
    permissionMode: "acceptEdits",
    cwd: siteDir,
    allowedTools: ["Read", "Glob", "Grep", "Bash"],
    prompt:
      "Deploy this project to Cloudflare. Use the CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN " +
      "available in the environment. Run the production build, then `npx wrangler deploy`. " +
      "Report the deployed URL and any follow-up steps. If a command fails, diagnose and retry once.",
  });
  recordSpend(cfg, result.costUsd);
  log.raw("\n" + result.text + "\n");
  recordNote(loadState(), "deploy", "Deploy session complete.");
  log.ok("deploy", "Deploy session finished.");
}
