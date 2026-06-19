// src/agents/venture/orchestrator.ts
// Drives the venture pipeline from the current stage forward. Runs each stage
// autonomously, fires human gates at strategic/irreducible points, and stops
// cleanly when a gate is pending so the run is fully resumable across sessions.

import type { ForgeConfig } from "../../lib/types.js";
import type { VentureState, StageId } from "../../lib/venture-types.js";
import { STAGE_ORDER } from "../../lib/venture-types.js";
import { STAGES, nextStage } from "../../lib/stages.js";
import { log } from "../../lib/log.js";
import { status } from "../../harness/status.js";
import {
  loadVenture,
  saveVenture,
  journal,
  pendingGates,
} from "../../harness/venture-state.js";
import { stageGate } from "../../harness/venture-gates.js";
import { BudgetExceeded } from "../../harness/budget.js";
import { runStage } from "./stage.js";

// Stages 8–9 reuse the existing engine. Imported lazily to keep this lean.
async function runReused(cfg: ForgeConfig, phase: "build" | "deploy" | "growth") {
  if (phase === "build") {
    const { runBuildPhase } = await import("../build.js");
    return runBuildPhase(cfg);
  }
  if (phase === "growth") {
    const { runGrowthCycle } = await import("../grow.js");
    return runGrowthCycle(cfg);
  }
}

export async function driveVenture(cfg: ForgeConfig): Promise<void> {
  const v = loadVenture();
  if (!v) {
    log.error("venture", "No venture found. Start one with `npm run venture -- launch \"<your idea hint>\"`.");
    return;
  }

  // If a gate is pending, don't proceed.
  if (pendingGates().length) {
    log.warn(
      "venture",
      `Paused: ${pendingGates().length} item(s) need you. Run \`npm run venture:gates\`, then \`npm run venture:resume\`.`
    );
    return;
  }

  let current: StageId | null = v.currentStage;
  // Resume at the first non-complete stage if currentStage is done/null.
  if (!current || v.stages[current].status === "complete") {
    current = STAGE_ORDER.find((id) => v.stages[id].status !== "complete" && v.stages[id].status !== "skipped") ?? null;
  }
  if (!current) {
    log.ok("venture", "All stages complete. The venture is live; run the growth loop with `npm run grow`.");
    return;
  }

  while (current) {
    const def = STAGES[current];
    log.info("venture", `▶ Stage: ${def.id} — ${def.title}`);
    status.start(`venture:${def.id}`, def.title);

    // Before building, run the needs-first requirements analysis so the
    // operator knows exactly what success depends on and what's already covered.
    if (def.id === "build") {
      log.step("venture", "Deriving capability requirements (needs-first)…");
      const { buildRequirements, reportRequirements } = await import("./requirements.js");
      await buildRequirements(cfg);
      reportRequirements();
      if (pendingGates().length) {
        v.currentStage = "build";
        v.stages.build.status = "blocked-on-gate";
        saveVenture(v);
        journal(v, "build", "Capability gaps need operator decisions before build.");
        log.gate(
          "The engine identified capabilities success depends on that you need to choose/set up.\n" +
            "Run `npm run venture:gates` to pick options, then `npm run venture:resume`."
        );
        return;
      }
    }

    try {
      // Stages 8–9 reuse existing engine phases.
      if (def.reusePhase) {
        const rec = v.stages[def.id];
        rec.status = "in-progress";
        v.currentStage = def.id;
        saveVenture(v);
        journal(v, def.id, `Running reused phase: ${def.reusePhase}`);
        await runReused(cfg, def.reusePhase);
        rec.status = "complete";
        rec.completedAt = new Date().toISOString();
        saveVenture(v);
        journal(v, def.id, `Completed reused phase: ${def.reusePhase}`);
      } else {
        const result = await runStage(cfg, v, def);
        if (!result.completed) {
          log.warn("venture", `Stage ${def.id} did not meet exit criteria. Open: ${result.openItems.join("; ")}`);
          // Don't auto-advance on incomplete; stop so the operator can look.
          return;
        }

        // Fire the gate (if any) before advancing.
        if (def.gateOnComplete !== "none") {
          fireGate(v, def.id);
          v.stages[def.id].status = "blocked-on-gate";
          v.pendingGateId = pendingGates()[0]?.id ?? null;
          saveVenture(v);
          journal(v, def.id, `Gate raised (${def.gateOnComplete}). Awaiting operator.`);
          log.gate(
            `Stage "${def.title}" is done and needs your input before continuing.\n` +
              `Run \`npm run venture:gates\` to review, then \`npm run venture:resume\`.`
          );
          return; // stop — resumable
        }
      }
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        log.error("venture", e.message);
        journal(loadVenture()!, def.id, "Aborted: budget exceeded.");
        return;
      }
      throw e;
    }

    current = nextStage(current);
    if (current) v.currentStage = current;
    saveVenture(v);
  }

  log.ok("venture", "Pipeline complete through to launch. Keep momentum with `npm run grow`.");
}

function fireGate(v: VentureState, stage: StageId) {
  const def = STAGES[stage];
  const rec = v.stages[stage];
  const prepared = rec.artifacts.slice();
  const titles: Record<string, { title: string; doThis: string; cost?: number }> = {
    beachhead: {
      title: "Approve the chosen niche (beachhead market)",
      doThis: "Read the decision brief and confirm the recommended niche (or pick another option).",
    },
    "model-offer": {
      title: "Approve the business model, offer & pricing",
      doThis: "Read the decision brief and confirm the recommended model/offer/price (or adjust).",
    },
    validation: {
      title: "Send the prepared customer-discovery outreach",
      doThis: "Review the drafted, Mom-Test-compliant messages and send them from your own account to the named prospects.",
    },
  };
  const meta = titles[stage] ?? { title: `Approve to continue past ${stage}`, doThis: "Review and approve." };
  stageGate(stage, def.gateOnComplete, meta.title, meta.doThis, prepared, meta.cost);
}
