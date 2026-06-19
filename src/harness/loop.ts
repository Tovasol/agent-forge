// src/harness/loop.ts
// The master loop. Chains phases in order, inserting human gates per the
// autonomy setting. Spend/deploy always gate in "gated" mode; every phase
// boundary gates in "phased" mode; "research-only" stops after decide.

import type { ForgeConfig, Phase } from "../lib/types.js";
import { PHASE_ORDER } from "../lib/types.js";
import { log } from "../lib/log.js";
import {
  loadState,
  saveState,
  markPhaseComplete,
  recordNote,
} from "./memory.js";
import { requestGate, GateBlocked } from "./gates.js";
import { BudgetExceeded } from "./budget.js";

import { runResearchPhase } from "../agents/research.js";
import { runDecidePhase } from "../agents/decide.js";
import { runBuildPhase } from "../agents/build.js";
import { runDeployPhase } from "../agents/deploy.js";
import { runOptimizePhase } from "../agents/optimize.js";

const RUNNERS: Record<Phase, (cfg: ForgeConfig) => Promise<unknown>> = {
  research: runResearchPhase,
  decide: runDecidePhase,
  build: runBuildPhase,
  deploy: runDeployPhase,
  optimize: runOptimizePhase,
};

function phasesToRun(target: Phase | "all", autonomy: string): Phase[] {
  if (target === "all") {
    if (autonomy === "research-only") return ["research", "decide"];
    return [...PHASE_ORDER];
  }
  return [target];
}

export async function runLoop(cfg: ForgeConfig, target: Phase | "all") {
  const phases = phasesToRun(target, cfg.autonomy);
  log.info("loop", `Plan: ${phases.join(" → ")}  (autonomy: ${cfg.autonomy})`);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];

    // In phased mode, gate BEFORE each phase (except the very first).
    if (cfg.autonomy === "phased" && i > 0) {
      const ok = await requestGate(cfg.autonomy, {
        kind: "phase",
        phase,
        title: `Proceed to "${phase}" phase?`,
        detail: `Previous phase complete. Next up: ${phase}. Review memory/progress.md first.`,
      });
      if (!ok) {
        log.warn("loop", `Stopped before ${phase}. Resume later with \`npm run resume\`.`);
        return;
      }
    }

    log.info("loop", `▶ Phase: ${phase}`);
    try {
      await RUNNERS[phase](cfg);
      markPhaseComplete(loadState(), phase);
      log.ok("loop", `✓ Phase complete: ${phase}`);
    } catch (err) {
      if (err instanceof GateBlocked) {
        log.warn("loop", "Paused at a human gate. Decide, then run `npm run resume`.");
        return;
      }
      if (err instanceof BudgetExceeded) {
        log.error("loop", err.message);
        recordNote(loadState(), phase, "Aborted: budget exceeded.");
        return;
      }
      throw err;
    }
  }

  const s = loadState();
  s.currentPhase = null;
  saveState(s);
  log.ok("loop", "All requested phases finished. See memory/progress.md.");
}

// Resume: figure out the next incomplete phase and continue from there.
export async function resumeLoop(cfg: ForgeConfig) {
  const s = loadState();
  if (s.pendingGate) {
    log.info("resume", `There is a pending ${s.pendingGate.kind} gate: ${s.pendingGate.title}`);
  }
  const remaining = PHASE_ORDER.filter((p) => !s.completedPhases.includes(p));
  if (!remaining.length) {
    log.ok("resume", "Nothing to resume — all phases complete.");
    return;
  }
  const next = remaining[0];
  log.info("resume", `Resuming at phase: ${next}`);
  await runLoop(cfg, cfg.autonomy === "research-only" && (next === "build" || next === "deploy" || next === "optimize") ? "all" : next);
}
