// src/cli.ts
// Agent Forge CLI.
//
//   forge run --phase <research|decide|build|deploy|optimize|all>
//   forge resume
//   forge status
//   forge doctor
//   forge init        (writes config/brief.json interactively-ish)

import { loadConfig, validateConfig } from "./lib/config.js";
import { authBanner } from "./lib/agent.js";
import { log } from "./lib/log.js";
import { runLoop, resumeLoop } from "./harness/loop.js";
import { loadState } from "./harness/memory.js";
import type { Phase } from "./lib/types.js";
import { runGrowthCycle, reportBacklog } from "./agents/grow.js";
import { reviewApprovals } from "./agents/approvals.js";
import { runAttribution } from "./agents/attribution.js";
import { watch } from "./harness/scheduler.js";
import { launchVenture, resumeVenture, ventureStatus } from "./agents/venture/launch.js";
import { buildProfile, reportProfile } from "./agents/venture/profile.js";
import { buildRequirements, reportRequirements } from "./agents/venture/requirements.js";
import { reviewVentureGates } from "./harness/venture-gates.js";
import { runDashboard } from "./harness/dashboard.js";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2] ?? "status";
  const cfg = loadConfig();

  if (cmd === "doctor") return doctor(cfg);
  if (cmd === "status") return status();
  if (cmd === "init") return init();

  const problems = validateConfig(cfg);
  if (problems.length) {
    for (const p of problems) log.warn("config", p);
  }
  authBanner(cfg);

  if (cmd === "resume") {
    await resumeLoop(cfg);
    return;
  }

  if (cmd === "run") {
    const phase = (arg("--phase") ?? "all") as Phase | "all";
    const valid = ["research", "decide", "build", "deploy", "optimize", "all"];
    if (!valid.includes(phase)) {
      log.error("cli", `Unknown phase "${phase}". Use one of: ${valid.join(", ")}`);
      process.exit(1);
    }
    await runLoop(cfg, phase, { fresh: process.argv.includes("--fresh") });
    return;
  }

  // ── Growth-agent commands ───────────────────────────────────────────────────
  if (cmd === "grow") {
    await runGrowthCycle(cfg);
    return;
  }
  if (cmd === "backlog") {
    reportBacklog();
    return;
  }
  if (cmd === "approvals") {
    await reviewApprovals();
    return;
  }
  if (cmd === "attribution") {
    runAttribution();
    return;
  }
  if (cmd === "watch") {
    const interval = parseInt(arg("--interval") ?? "60", 10);
    const maxCycles = arg("--max-cycles") ? parseInt(arg("--max-cycles")!, 10) : undefined;
    await watch(cfg, { intervalMinutes: interval, maxCycles });
    return;
  }

  if (cmd === "dash" || cmd === "dashboard" || cmd === "monitor") {
    await runDashboard();
    return;
  }

  // ── Venture engine (idea -> live business) ──────────────────────────────────
  if (cmd === "venture") {
    const sub = process.argv[3] ?? "status";
    if (sub === "launch") {
      // hint is everything after `launch`
      const idx = process.argv.indexOf("launch");
      const hint = process.argv.slice(idx + 1).filter((a) => !a.startsWith("--")).join(" ");
      await launchVenture(cfg, hint);
      return;
    }
    if (sub === "resume") {
      await resumeVenture(cfg);
      return;
    }
    if (sub === "gates") {
      await reviewVentureGates();
      return;
    }
    if (sub === "context" || sub === "profile") {
      // (re)build the operator profile from context/, then show it
      if (sub === "context") await buildProfile(cfg, { force: true });
      reportProfile();
      return;
    }
    if (sub === "requirements" || sub === "needs") {
      if (sub === "requirements") await buildRequirements(cfg);
      reportRequirements();
      return;
    }
    if (sub === "status") {
      ventureStatus();
      return;
    }
    log.error("cli", `Unknown venture subcommand "${sub}". Use launch|resume|gates|context|profile|requirements|status.`);
    return;
  }

  log.error("cli", `Unknown command "${cmd}".`);
  log.raw(
    "Usage: forge <run|resume|status|doctor|init|grow|backlog|approvals|attribution|watch|venture> ...\n" +
      '  venture launch "<hint>" | venture resume | venture gates | venture status'
  );
  process.exit(1);
}

function status() {
  const s = loadState();
  log.raw("Agent Forge — status");
  log.raw(`  Started:          ${s.startedAt}`);
  log.raw(`  Updated:          ${s.updatedAt}`);
  log.raw(`  Completed phases: ${s.completedPhases.join(", ") || "(none)"}`);
  log.raw(`  Current phase:    ${s.currentPhase ?? "(idle)"}`);
  log.raw(`  Est. spend:       $${s.totalCostUsd.toFixed(4)}`);
  if (s.pendingGate) {
    log.raw(`  PENDING GATE:     [${s.pendingGate.kind}] ${s.pendingGate.title}`);
    log.raw(`                    ${s.pendingGate.detail}`);
    log.raw(`  -> review memory/progress.md, then run \`npm run resume\``);
  }
}

function doctor(cfg: ReturnType<typeof loadConfig>) {
  log.raw("Agent Forge — doctor\n");
  const ok = (b: boolean) => (b ? "✓" : "✗");
  log.raw(`  Auth mode:            ${cfg.auth}`);
  log.raw(`  ${ok(cfg.auth === "subscription" || !!cfg.apiKey)} Auth usable`);
  log.raw(`  Models:               lead=${cfg.models.lead} worker=${cfg.models.worker}`);
  log.raw(`  Autonomy:             ${cfg.autonomy}`);
  log.raw(`  Budget cap:           $${cfg.maxBudgetUsd}`);
  log.raw(`  Brief.niche:          ${cfg.brief.niche}`);
  log.raw(`  Operator stack:       ${cfg.brief.services.join(", ")}`);
  log.raw("\n  Research connectors (optional):");
  log.raw(`    ${ok(!!cfg.research.firecrawlKey)} Firecrawl`);
  log.raw(`    ${ok(!!cfg.research.exaKey)} Exa`);
  log.raw(`    ${ok(!!cfg.research.tavilyKey)} Tavily`);
  log.raw("    (none required — native WebSearch/WebFetch is the default)");
  log.raw("\n  Delivery (needed at deploy/funnel time):");
  log.raw(`    ${ok(!!cfg.delivery.cloudflareApiToken)} Cloudflare token`);
  log.raw(`    ${ok(!!cfg.delivery.googleServiceAccountJson)} Google service account`);
  log.raw("\n  Next: `npm install` then `npm run forge -- run --phase research`");
  validateConfig(cfg).forEach((p) => log.warn("doctor", p));
}

function init() {
  const dir = resolve(process.cwd(), "config");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "brief.json");
  if (existsSync(path)) {
    log.warn("init", "config/brief.json already exists; not overwriting.");
    return;
  }
  const template = {
    businessName: "PipelineForge",
    niche: "managed data pipeline service for mid-market SaaS",
    icp: "Heads of Data / founding data engineers at 20–200 person B2B SaaS companies who need reliable ETL/ELT without hiring a team",
    monthlyBudgetUsd: 50,
    services: ["React", "Cloudflare", "Google Workspace"],
    goal:
      "Launch a lead-magnet site that converts qualified data teams into discovery calls for a done-for-you data pipeline service, then optimize conversion.",
    notes: "Operator fulfills work orders manually after clients buy.",
  };
  writeFileSync(path, JSON.stringify(template, null, 2));
  log.ok("init", "Wrote config/brief.json — edit it, then run `npm run forge -- run --phase research`.");
}

main().catch((err) => {
  log.error("fatal", err?.stack || String(err));
  process.exit(1);
});
