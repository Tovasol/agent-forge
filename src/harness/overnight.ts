// src/harness/overnight.ts
// A bounded, self-improving loop meant to run unattended (e.g. overnight):
//   ensure a full pipeline pass, then repeatedly BENCHMARK against competitors,
//   apply the improvements, and rebuild — until a time budget runs out or the
//   site converges. Survives usage-limit pauses (runAgent waits and resumes),
//   respects money/identity gates, and writes a morning summary.
//
// It deliberately does NOT auto-deploy unless explicitly allowed: pushing to
// real infra unattended is risky. Default = improve the build; you review and
// deploy in the morning.

import { log } from "../lib/log.js";
import { status } from "../harness/status.js";
import type { ForgeConfig } from "../lib/types.js";
import { PHASE_ORDER, type Phase } from "../lib/types.js";
import { runLoop } from "./loop.js";
import { runBenchmark } from "../agents/benchmark.js";
import { setOvernightPolicy } from "./gates.js";
import { ensureRepo, snapshot } from "./snapshot.js";
import { reopenPhases, loadState, recordNote, clearResearchPlan } from "./memory.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface OvernightOpts {
  hours: number; // wall-clock budget
  maxPasses: number; // hard cap on improvement passes
  allowDeploy: boolean; // opt-in: auto-deploy each pass (risky, off by default)
  spendCeilingUsd: number; // auto-approve spends at/under this; decline above
}

interface PassLog {
  pass: number;
  at: string;
  score: number;
  improvements: number;
  converged: boolean;
  deepestPhase: string;
  liveIssues: number;
}

export async function runOvernight(cfg: ForgeConfig, opts: OvernightOpts): Promise<void> {
  const deadline = Date.now() + opts.hours * 3600_000;
  const fmtRemaining = () => {
    const ms = deadline - Date.now();
    const h = Math.floor(ms / 3600_000);
    const m = Math.round((ms % 3600_000) / 60000);
    return `${h}h ${m}m`;
  };

  log.info("overnight", `Starting unattended improvement loop. Budget: ${opts.hours}h, up to ${opts.maxPasses} passes.`);
  log.info("overnight", opts.allowDeploy ? "Auto-deploy: ON (will push each pass)." : "Auto-deploy: OFF (build only; deploy in the morning).");

  // Gates must not freeze the night: deploy only if opted in; small spends auto-
  // approve up to a ceiling; identity/legal gates are skipped (deferred to you).
  setOvernightPolicy({ allowDeploy: opts.allowDeploy, spendCeilingUsd: opts.spendCeilingUsd });

  // SAFEGUARD: baseline snapshot so there's always a restore point.
  ensureRepo();
  snapshot("overnight: baseline before run", { markGood: true });

  const passLog: PassLog[] = [];

  // 1) Ensure a full first pass exists.
  const st = loadState();
  const firstPassDone = PHASE_ORDER.every((p) => st.completedPhases.includes(p) || (!opts.allowDeploy && p === "deploy"));
  if (!firstPassDone) {
    log.info("overnight", "No complete pass yet — running the initial pipeline…");
    try {
      await runLoop(cfg, "all");
    } catch (e) {
      log.warn("overnight", `Initial pass stopped early: ${(e as Error).message}. Continuing into improvement loop.`);
    }
  }

  let pass = 0;
  let convergedStreak = 0;
  while (Date.now() < deadline && pass < opts.maxPasses) {
    pass++;
    log.info("overnight", `── Improvement pass ${pass}/${opts.maxPasses} · ${fmtRemaining()} left ──`);

    // 2) Benchmark vs competitors → queues improvement directives at the right
    //    phase (positioning→research, offer→decide, design/copy→build) and tells
    //    us the EARLIEST phase touched so the rebuild cascades from there.
    let result;
    try {
      result = await runBenchmark(cfg);
    } catch (e) {
      log.warn("overnight", `Benchmark failed this pass: ${(e as Error).message}. Retrying next pass.`);
      continue;
    }

    const materialImps = (result.improvements ?? []).filter((i) => i.impact !== "low").length;
    passLog.push({
      pass,
      at: new Date().toISOString(),
      score: result.score,
      improvements: materialImps,
      converged: result.converged,
      deepestPhase: result.earliestPhase ?? "—",
      liveIssues: (result.liveIssues ?? []).length,
    });

    // 3) Convergence: stop after two consecutive "no material gaps" results.
    if (result.converged || materialImps === 0) {
      convergedStreak++;
      if (convergedStreak >= 2) {
        log.ok("overnight", "Site has converged against competitors — stopping early. Quota saved.");
        break;
      }
      // Nothing actionable this pass — skip the rebuild.
      continue;
    } else {
      convergedStreak = 0;
    }

    // 4) Cascade from the earliest phase the benchmark flagged — so a positioning
    //    gap genuinely re-runs research → decide → build (further research & new
    //    decisions), while a design gap only rebuilds. Deploy is included only
    //    when opted in; otherwise the cascade stops before it.
    let from: Phase = result.earliestPhase ?? "build";
    const order: Phase[] = ["research", "decide", "build", "deploy", "optimize"];
    let chain = order.slice(order.indexOf(from));
    if (!opts.allowDeploy) chain = chain.filter((p) => p !== "deploy");

    if (from === "research") {
      clearResearchPlan(); // pivot the research lens; keeps the source ledger
      log.info("overnight", "Strategic gap found — re-running research & decisions this pass (full cascade).");
    }

    // SAFEGUARD: snapshot the current (working) state as a known-good restore
    // point BEFORE we rebuild, so a bad pass can be rolled back.
    snapshot(`good state before pass ${pass} (score ${result.score})`, { markGood: true });

    reopenPhases(chain);
    log.info("overnight", `Re-aligning: ${chain.join(" → ")}`);
    try {
      await runLoop(cfg, "all");
      snapshot(`after pass ${pass} rebuild`);
    } catch (e) {
      log.warn("overnight", `Pass ${pass} rebuild stopped: ${(e as Error).message}. Will reassess next pass.`);
      snapshot(`after pass ${pass} (stopped early)`);
    }

    if (Date.now() >= deadline) break;
  }

  writeMorningSummary(cfg, passLog, opts, pass);
  setOvernightPolicy(null);
  status.start("done", "Overnight loop complete — see memory/MORNING.md");
  log.ok("overnight", `Done. ${pass} improvement pass(es). Read memory/MORNING.md for the summary.`);
}

function writeMorningSummary(cfg: ForgeConfig, passes: PassLog[], opts: OvernightOpts, total: number) {
  const path = resolve(process.cwd(), "memory/MORNING.md");
  mkdirSync(dirname(path), { recursive: true });
  const best = passes.reduce((a, b) => (b.score > a.score ? b : a), { score: 0 } as PassLog);
  const lines = [
    "# Overnight run — morning summary",
    "",
    `Ran ${total} improvement pass(es) over a ${opts.hours}h budget.`,
    `Auto-deploy was ${opts.allowDeploy ? "ON" : "OFF (review and deploy when you're ready)"}.`,
    "",
    "## Quality trajectory (self-assessed vs competitors)",
    ...(passes.length
      ? passes.map(
          (p) =>
            `- Pass ${p.pass}: score ${p.score}/100, ${p.improvements} improvement(s) applied (cascaded from ${p.deepestPhase})` +
            `${p.liveIssues ? `, ${p.liveIssues} live issue(s) fixed` : ""}${p.converged ? " — converged" : ""}`
        )
      : ["- (no benchmark passes completed — likely paused on usage limits most of the night)"]),
    "",
    `Best score reached: ${best.score}/100.`,
    "",
    "## What to do now",
    "1. Review the built site in `site/scaffold/` (run it locally).",
    "2. Read the latest `memory/benchmark/benchmark-*.json` for the competitor comparison and rationale.",
    opts.allowDeploy
      ? "3. The site was (re)deployed each pass — check it live."
      : "3. When happy, deploy it: `npm run forge -- run --phase deploy` (approve the gate).",
    "4. Then focus on TRAFFIC — the site can't collect leads until people reach it. Promote it, then feed metrics and `npm run iterate`.",
    "",
    "## Honest note",
    "No leads will have arrived overnight — that needs real traffic, which needs promotion and time. What improved is the site's quality and conversion-readiness vs. competitors.",
  ];
  writeFileSync(path, lines.join("\n"));
  recordNote(loadState(), "optimize", `Overnight loop finished: ${total} pass(es). See memory/MORNING.md.`);
}
