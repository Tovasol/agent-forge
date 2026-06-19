// src/agents/deploy.ts
// Phase 4: HUMAN-GATED deployment to Cloudflare. This is a spend/deploy gate —
// the loop always stops here for approval before shipping to production.

import { resolve } from "node:path";
import { runAgent } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import { loadState, recordNote, deployedUrlPath, loadDeployedUrl, saveDeployedUrl } from "../harness/memory.js";
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
  const urlPath = deployedUrlPath();
  const result = await runAgent({
    cfg,
    model: cfg.models.worker,
    systemPrompt: prompt("builder"),
    label: "deploy",
    intent: "building → wrangler deploy → capturing the live URL",
    permissionMode: "acceptEdits",
    cwd: siteDir,
    allowedTools: ["Read", "Glob", "Grep", "Bash"],
    prompt:
      "Deploy this project to Cloudflare. Use the CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN " +
      "available in the environment. Run the production build, then `npx wrangler deploy`. " +
      "From wrangler's output, extract the LIVE deployed URL (the workers.dev URL or the custom " +
      `domain/route it published to) and WRITE that URL — just the URL, on one line — to the file "${urlPath}". ` +
      "Then report the deployed URL and any follow-up steps. If a command fails, diagnose and retry once.",
  });
  recordSpend(cfg, result.costUsd);
  log.raw("\n" + result.text + "\n");

  // Persist the discovered URL: prefer the file the agent wrote; otherwise parse
  // it from the agent's report. Either way the operator never has to set it.
  let liveUrl = loadDeployedUrl();
  if (!liveUrl) {
    const m = result.text.match(/https?:\/\/[^\s"')]+\.(?:workers\.dev|pages\.dev)[^\s"')]*/) ||
      result.text.match(/https?:\/\/[^\s"')]+/);
    if (m) {
      liveUrl = m[0];
      saveDeployedUrl(liveUrl);
    }
  }
  if (liveUrl) log.ok("deploy", `Live at ${liveUrl} (saved — self-validation will use it automatically).`);

  recordNote(loadState(), "deploy", liveUrl ? `Deploy complete. Live URL: ${liveUrl}` : "Deploy session complete.");
  log.ok("deploy", "Deploy session finished.");
}
