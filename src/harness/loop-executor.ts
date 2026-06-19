// src/harness/loop-executor.ts
// Walks an idea through the codified loop spec, stage by stage, enforcing gates.
// Control flow is driven ENTIRELY by the data spec (versioned stages + predicates),
// not hardcoded — so the meta-loop can change the process and this executor honors it.
//
// Per stage: check dependencies → run the stage (work its checklist) → evaluate the
// gate predicate over the idea's metrics bag → advance / pivot / kill / human-gate.

import { log } from "../lib/log.js";
import { status } from "./status.js";
import { evalGate } from "../lib/gate-eval.js";
import type { ForgeConfig } from "../lib/types.js";
import type { LoopSpec, VersionedStage } from "../lib/loop-schema.js";
import { requestGate } from "./gates.js";
import { snapshot } from "./snapshot.js";
import {
  loadIdea,
  saveIdea,
  loadIdeaSpec,
  getMetrics,
  episodic,
  type IdeaRecord,
} from "./loop-memory.js";
import { runLoopStage } from "../agents/loop/run-stage.js";

function orderedStages(spec: LoopSpec): VersionedStage[] {
  return [...spec.stages].sort((a, b) => a.order - b.order);
}
function stageById(spec: LoopSpec, id: string): VersionedStage | undefined {
  return spec.stages.find((s) => s.id === id);
}

interface RunOpts {
  /** Run only a single stage then stop (default false = run through). */
  singleStage?: boolean;
  /** Maximum stage transitions in one invocation (safety bound). */
  maxSteps?: number;
}

/**
 * Run the idea's loop from its current stage forward. Stops at: a human gate, a
 * kill, completion, a stage that can't pass its gate after running, or maxSteps.
 */
export async function runIdeaLoop(cfg: ForgeConfig, ideaId: string, opts: RunOpts = {}): Promise<void> {
  const idea = loadIdea(ideaId);
  if (!idea) {
    log.error("loop", `No idea "${ideaId}". Create it first.`);
    return;
  }
  if (idea.status !== "active") {
    log.warn("loop", `Idea "${ideaId}" is ${idea.status}; nothing to run.`);
    return;
  }

  const spec = loadIdeaSpec(ideaId);
  const stages = orderedStages(spec);
  const maxSteps = opts.maxSteps ?? stages.length + 4;
  let steps = 0;

  log.info("loop", `Running idea "${idea.hint}" from stage "${idea.currentStage}" (spec v${spec.specVersion}).`);

  while (steps < maxSteps) {
    steps++;
    const stage = stageById(spec, idea.currentStage);
    if (!stage) {
      log.error("loop", `Current stage "${idea.currentStage}" not in spec. Stopping.`);
      return;
    }

    // Already complete? advance to the next ordered, incomplete stage.
    if (idea.completedStages.includes(stage.id)) {
      const next = orderedStages(spec).find((s) => !idea.completedStages.includes(s.id));
      if (!next) {
        log.ok("loop", `🎉 All stages complete for "${idea.hint}". The framework's job is done; profitability is the real test.`);
        idea.status = "shipped";
        saveIdea(idea);
        return;
      }
      idea.currentStage = next.id;
      saveIdea(idea);
      continue;
    }

    // Dependencies must be satisfied.
    const unmet = stage.dependencies.filter((d) => !idea.completedStages.includes(d));
    if (unmet.length) {
      // Jump back to the earliest unmet dependency.
      const dep = orderedStages(spec).find((s) => unmet.includes(s.id))!;
      log.warn("loop", `Stage "${stage.id}" needs ${unmet.join(", ")} first → going to "${dep.id}".`);
      idea.currentStage = dep.id;
      saveIdea(idea);
      continue;
    }

    // Run the stage (work its checklist, produce artifacts, emit metrics).
    log.info("loop", `▶ Stage ${stage.order}: ${stage.title}`);
    snapshot(`loop ${ideaId}: before ${stage.id}`, { markGood: true });
    const result = await runLoopStage(cfg, ideaId, idea.hint, stage);
    log.raw(`\n${result.summary}\n`);

    // If the agent is blocked on operator real-world action, surface a human gate.
    if (result.blockedOnHuman.length && stage.gate.human !== "none") {
      const proceed = await requestGate(cfg.autonomy, {
        kind: stage.gate.human === "wtp-evidence" ? "deploy" : "spend",
        phase: "deploy",
        title: `Operator action needed for "${stage.title}"`,
        detail:
          `This stage needs real-world evidence only you can provide:\n- ${result.blockedOnHuman.join("\n- ")}\n\n` +
          `Provide it (e.g. record the metric via \`forge idea metric ${ideaId} <key>=<value>\`) then resume. ` +
          `The system will NOT fabricate this.`,
        estimatedCostUsd: 0,
      });
      if (!proceed) {
        log.warn("loop", `Paused at "${stage.id}" awaiting operator evidence. Resume with \`forge idea run ${ideaId}\`.`);
        return;
      }
    }

    // Evaluate the gate over the freshly-updated metrics bag.
    const metrics = getMetrics(ideaId);
    const pass = evalGate(stage.gate.predicate, metrics);

    if (pass) {
      // Human strategic/spend gate before formally advancing, if required.
      if (["strategic", "spend", "identity", "legal", "contact", "wtp-evidence"].includes(stage.gate.human)) {
        const proceed = await requestGate(cfg.autonomy, {
          kind: stage.gate.human === "wtp-evidence" ? "deploy" : (stage.gate.human as any),
          phase: "deploy",
          title: `Approve advancing past "${stage.title}"?`,
          detail: `Gate met: ${stage.gate.advance}\nReview the stage artifacts before approving.`,
          estimatedCostUsd: 0,
        });
        if (!proceed) {
          log.warn("loop", `Held at "${stage.id}" for your approval. Resume with \`forge idea run ${ideaId}\`.`);
          return;
        }
      }

      idea.completedStages.push(stage.id);
      episodic(ideaId).add(stage.id, `GATE PASSED: ${stage.gate.advance}`, "verdict");
      log.ok("loop", `✓ Gate passed: ${stage.title}`);
      snapshot(`loop ${ideaId}: ${stage.id} complete`, { markGood: true });

      const next = orderedStages(spec).find((s) => !idea.completedStages.includes(s.id));
      if (!next) {
        log.ok("loop", `🎉 All stages complete for "${idea.hint}".`);
        idea.status = "shipped";
        saveIdea(idea);
        return;
      }
      idea.currentStage = next.id;
      saveIdea(idea);
      if (opts.singleStage) return;
      continue;
    }

    // Gate not met → decide pivot vs. stop-for-more-work.
    // If the stage produced open items, it likely needs another pass or operator input.
    episodic(ideaId).add(stage.id, `GATE NOT MET (${stage.gate.predicate}). Open: ${result.openItems.join("; ") || "none"}`, "verdict");
    log.warn("loop", `Gate not met for "${stage.id}": ${stage.gate.predicate}`);
    log.raw(
      `\nThis stage isn't done. Options:\n` +
        `  • If it needs operator real-world action, provide it then \`forge idea run ${ideaId}\`.\n` +
        `  • If the work needs another pass, run again.\n` +
        `  • Pivot guidance: ${stage.gate.pivot.when} → would return to "${stage.gate.pivot.toStage}".\n` +
        `  • Kill criterion: ${stage.gate.kill}\n`,
    );
    // Stop here rather than loop infinitely; operator decides next move.
    return;
  }

  log.warn("loop", `Reached step bound (${maxSteps}). Resume with \`forge idea run ${ideaId}\`.`);
}

/** Operator-driven pivot: send the idea back to a named stage and reopen downstream. */
export function pivotIdea(ideaId: string, toStage: string): boolean {
  const idea = loadIdea(ideaId);
  if (!idea) return false;
  const spec = loadIdeaSpec(ideaId);
  const target = stageById(spec, toStage);
  if (!target) {
    log.error("loop", `Unknown stage "${toStage}".`);
    return false;
  }
  // Reopen the target and everything after it.
  idea.completedStages = idea.completedStages.filter((id) => {
    const s = stageById(spec, id);
    return s ? s.order < target.order : false;
  });
  idea.currentStage = toStage;
  saveIdea(idea);
  episodic(ideaId).add(toStage, `PIVOT: operator reopened from "${toStage}" onward.`, "verdict");
  log.ok("loop", `Pivoted "${ideaId}" back to "${toStage}"; downstream stages reopened.`);
  return true;
}

/** Operator-driven kill. */
export function killIdea(ideaId: string, reason: string): boolean {
  const idea = loadIdea(ideaId);
  if (!idea) return false;
  idea.status = "killed";
  idea.killReason = reason;
  saveIdea(idea);
  episodic(ideaId).add(idea.currentStage, `KILLED: ${reason}`, "verdict");
  log.ok("loop", `Idea "${ideaId}" killed: ${reason}`);
  return true;
}
