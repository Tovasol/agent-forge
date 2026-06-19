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
import { loadState, lastProposal, reopenPhases, clearResearchPlan } from "./harness/memory.js";
import {
  listDirectives,
  addDirective,
  clearDirective,
  clearAllDirectives,
  classifyEarliestPhase,
  cascadeFrom,
} from "./harness/directives.js";
import { PHASE_ORDER, type Phase } from "./lib/types.js";
import { runOvernight } from "./harness/overnight.js";
import { snapshot, listSnapshots, rollback, lastGood } from "./harness/snapshot.js";
import { runGrowthCycle, reportBacklog } from "./agents/grow.js";
import { reviewApprovals } from "./agents/approvals.js";
import { runAttribution } from "./agents/attribution.js";
import { watch } from "./harness/scheduler.js";
import { launchVenture, resumeVenture, ventureStatus } from "./agents/venture/launch.js";
import { buildProfile, reportProfile } from "./agents/venture/profile.js";
import { buildRequirements, reportRequirements } from "./agents/venture/requirements.js";
import { reviewVentureGates } from "./harness/venture-gates.js";
import { runDashboard } from "./harness/dashboard.js";
import { addSteering, clearSticky, pendingCount, stickyText } from "./harness/steering.js";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2] ?? "status";
  const cfg = loadConfig();

  // Graceful Ctrl-C: tell the user how to resume instead of a bare ^C.
  // Completed phases/facets are checkpointed, so resuming continues, not redoes.
  let interrupting = false;
  process.on("SIGINT", () => {
    if (interrupting) process.exit(130); // second Ctrl-C forces immediate exit
    interrupting = true;
    log.warn(
      "interrupt",
      "Ctrl-C received. Finishing the current write and stopping. Completed work is saved — " +
        "run `npm run resume` to continue from here. (Press Ctrl-C again to force-quit.)"
    );
    // Let in-flight synchronous state writes settle, then exit.
    setTimeout(() => process.exit(130), 500);
  });

  if (cmd === "doctor") return doctor(cfg);
  if (cmd === "status") return status();
  if (cmd === "init") return init();

  // `tell` is a lightweight, separate-process command (writes to the steering
  // inbox the running engine reads). No auth/config banner needed.
  if (cmd === "tell") {
    if (process.argv.includes("--clear")) {
      clearSticky();
      log.ok("steer", "Cleared standing guidance.");
      return;
    }
    if (process.argv.includes("--show")) {
      const sticky = stickyText();
      log.raw(`Pending one-shot messages: ${pendingCount()}`);
      log.raw(sticky ? `Standing guidance:\n${sticky}` : "No standing guidance.");
      return;
    }
    const sticky = process.argv.includes("--sticky");
    const urgent = process.argv.includes("--now");
    const msg = process.argv.slice(3).filter((a) => !a.startsWith("--")).join(" ");
    if (!msg.trim()) {
      log.error("steer", 'Give a message: npm run forge -- tell "I updated the API key, retry the deploy"');
      log.raw("  flags: --now (interrupt current step) · --sticky (standing guidance) · --clear · --show");
      return;
    }
    addSteering(msg.trim(), { sticky, urgent });
    log.ok(
      "steer",
      urgent
        ? "Sent. The engine will interrupt the current step and apply it."
        : sticky
          ? "Added to standing guidance (applies to every step until --clear)."
          : "Queued. The engine will apply it on the next step."
    );
    return;
  }

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

  // ── Persistent operator decisions that re-align the plan (the domino) ───────
  if (cmd === "directive" || cmd === "decision" || cmd === "pivot") {
    if (process.argv.includes("--list")) {
      const ds = listDirectives();
      if (!ds.length) log.raw("No standing decisions.");
      for (const d of ds) log.raw(`  ${d.id}  [from ${d.fromPhase}]  ${d.text}`);
      return;
    }
    if (process.argv.includes("--clear")) {
      const id = arg("--clear");
      if (id && id !== "true") {
        log.ok("directive", clearDirective(id) ? `Removed ${id}.` : `No directive ${id}.`);
      } else {
        clearAllDirectives();
        log.ok("directive", "Cleared all standing decisions.");
      }
      return;
    }
    const text = process.argv.slice(3).filter((a) => !a.startsWith("--")).join(" ").trim();
    if (!text) {
      log.error("directive", 'Give a decision: npm run forge -- decision "site should have a professional, bright design"');
      log.raw("  flags: --from <research|decide|build|deploy|optimize> (override impact) · --apply (rebuild now) · --list · --clear [id]");
      return;
    }
    const fromArg = arg("--from") as Phase | undefined;
    const fromPhase: Phase = fromArg && PHASE_ORDER.includes(fromArg) ? fromArg : classifyEarliestPhase(text);
    const d = addDirective(text, fromPhase);

    const cascade = cascadeFrom(fromPhase);
    // A research-level pivot re-plans research (keeps sources as reference).
    if (fromPhase === "research") clearResearchPlan();
    reopenPhases(cascade);

    log.ok("directive", `Recorded decision ${d.id} (affects from "${fromPhase}").`);
    log.raw(
      `  This decision is now binding on every agent. Re-aligning these phases: ${cascade.join(" → ")}.\n` +
        `  ${fromPhase === "research" ? "Research will RE-PLAN with this lens; " : ""}each phase redoes in alignment.`
    );
    if (process.argv.includes("--apply")) {
      log.info("directive", "Applying now — rebuilding in alignment…");
      await runLoop(cfg, "all");
    } else {
      log.raw("  Run `npm run iterate` (or `npm run resume`) to rebuild in alignment.");
    }
    return;
  }

  // ── Snapshots & rollback (safeguard against bad autonomous passes) ──────────
  if (cmd === "snapshots" || cmd === "snapshot") {
    if (cmd === "snapshot") {
      const label = process.argv.slice(3).filter((a) => !a.startsWith("--")).join(" ") || "manual snapshot";
      const h = snapshot(label, { markGood: process.argv.includes("--good") });
      log.raw(h ? `Snapshot ${h} created.` : "Nothing to snapshot (no changes).");
      return;
    }
    const snaps = listSnapshots(20);
    if (!snaps.length) {
      log.raw("No snapshots yet. They're created automatically on phase/deploy/overnight progress.");
      return;
    }
    const good = lastGood();
    log.raw("Recent snapshots (newest first):");
    for (const s of snaps) log.raw(`  ${s.hash}${good && s.hash === good ? " ★good" : "     "}  ${s.when.padEnd(16)}  ${s.subject}`);
    log.raw(`\nRoll back with:  npm run forge -- rollback [--to <hash>]   (defaults to the last ★good state)`);
    return;
  }
  if (cmd === "rollback") {
    const to = arg("--to");
    const okRb = rollback(to);
    if (okRb) log.raw("Done. Review site/scaffold, then `npm run forge -- run --phase deploy` to re-publish the restored version.");
    return;
  }

  // ── Overnight: unattended, bounded self-improvement loop ────────────────────
  if (cmd === "overnight" || cmd === "autoloop") {
    const hours = parseFloat(arg("--hours") ?? "8");
    const maxPasses = parseInt(arg("--max-passes") ?? "12", 10);
    const allowDeploy = process.argv.includes("--deploy");
    const spendCeilingUsd = parseFloat(arg("--spend-ceiling") ?? "0");
    await runOvernight(cfg, { hours, maxPasses, allowDeploy, spendCeilingUsd });
    return;
  }

  // ── Iterate: another improvement pass over a completed run ───────────────────
  // Keeps all artifacts; re-opens phases so each re-examines its work and
  // improves in place (idempotent-by-inspection). Applies the latest optimize
  // proposal by injecting it as guidance. Add --deep to also refresh research.
  if (cmd === "iterate" || cmd === "improve" || cmd === "loop") {
    const s = loadState();
    if (!s.completedPhases.includes("optimize")) {
      log.warn(
        "iterate",
        "The pipeline hasn't completed a full pass yet. Finish with `npm run resume` first, then iterate."
      );
      return;
    }
    // Apply the most recent optimization proposal on this pass.
    const proposal = lastProposal();
    if (proposal) {
      addSteering(
        `Apply this approved optimization this pass, then verify it: ${proposal}. ` +
          `If it needs a copy/funnel/offer change, make it in the build; keep everything else intact.`
      );
      log.info("iterate", `Applying latest proposal this pass: ${proposal.slice(0, 100)}…`);
    } else {
      log.info("iterate", "No pending proposal found — running a general improvement & refresh pass.");
    }
    const deep = process.argv.includes("--deep");
    // Re-open the improvement phases. Research is only re-opened with --deep
    // (it resumes/fills gaps rather than redoing, but costs quota).
    const phases: Phase[] = deep
      ? ["research", "decide", "build", "deploy", "optimize"]
      : ["decide", "build", "deploy", "optimize"];
    reopenPhases(phases);
    log.ok("iterate", `Re-opened: ${phases.join(", ")}. Running an improvement pass (progress preserved).`);
    await runLoop(cfg, "all");
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
    "Usage: forge <run|resume|iterate|overnight|decision|snapshots|rollback|status|doctor|init|grow|backlog|approvals|attribution|watch|tell|dash|venture> ...\n" +
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
