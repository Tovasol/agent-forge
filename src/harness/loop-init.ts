// src/harness/loop-init.ts
// Bootstrap a codified-loop idea FROM THE SYSTEM'S EXISTING KNOWLEDGE rather than
// from a hand-typed hint. The operator already stated the idea in config/brief.json
// (businessName, niche, icp, budget, services, goal); re-asking for it would violate
// the principle that the operator shouldn't restate what the framework already has.
//
// This composes an idea hint from the brief, pre-seeds the idea's SEMANTIC facts and
// metrics with everything the brief establishes, and (optionally) chains the prior-
// work importer so prior research/decisions are folded in too. Idempotent-ish: if an
// active idea bootstrapped from the brief already exists, it reuses it instead of
// creating duplicates.

import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import type { Brief } from "../lib/types.js";
import {
  createIdea,
  listIdeas,
  setFact,
  updateMetrics,
  episodic,
  writeArtifact,
  type IdeaRecord,
} from "./loop-memory.js";
import { importPriorWork } from "./loop-import.js";

/** Compose a one-line idea hint from the brief. */
export function hintFromBrief(b: Brief): string {
  const name = b.businessName && b.businessName !== "Untitled Venture" ? `${b.businessName}: ` : "";
  const icp = b.icp ? ` for ${b.icp}` : "";
  return `${name}${b.niche}${icp}`.trim();
}

/** Seed the idea's semantic memory + metrics with what the brief already establishes. */
export function seedFromBrief(ideaId: string, b: Brief): void {
  setFact(ideaId, "business_name", b.businessName);
  setFact(ideaId, "niche", b.niche);
  if (b.icp) setFact(ideaId, "icp", b.icp);
  setFact(ideaId, "monthly_budget_usd", b.monthlyBudgetUsd);
  setFact(ideaId, "operator_stack", b.services);
  setFact(ideaId, "goal", b.goal);
  if (b.notes) setFact(ideaId, "brief_notes", b.notes);

  // The brief stating an ICP is a real (if provisional) input — record it as a
  // metric the niche stage can build on, but DO NOT mark the niche gate satisfied;
  // the stage still validates problem severity etc. against live evidence.
  if (b.icp) updateMetrics(ideaId, { icp_defined: true });

  writeArtifact(ideaId, "imported/brief.json", JSON.stringify(b, null, 2));
  episodic(ideaId).add("intake", `Initialized from config/brief.json — niche "${b.niche}"${b.icp ? `, ICP "${b.icp}"` : ""}, budget $${b.monthlyBudgetUsd}/mo.`, "event");
}

/** Find an existing idea already bootstrapped from this brief (to avoid duplicates). */
function existingBriefIdea(hint: string): IdeaRecord | null {
  return (
    listIdeas().find((i) => i.status === "active" && i.hint === hint) ?? null
  );
}

/**
 * Initialize (or reuse) an idea from the brief. If `importPrior` is set, also fold
 * in prior research/decisions/venture state from this folder. Returns the idea id.
 */
export async function initIdeaFromBrief(
  cfg: ForgeConfig,
  opts: { importPrior?: boolean; force?: boolean } = {},
): Promise<string> {
  const b = cfg.brief;
  const hint = hintFromBrief(b);

  const existing = !opts.force ? existingBriefIdea(hint) : null;
  if (existing) {
    log.info("init", `An idea for "${hint}" already exists (${existing.id}). Reusing it (use --force to create a new one).`);
    return existing.id;
  }

  const rec = createIdea(hint);
  log.ok("init", `Initialized idea "${rec.id}" from config/brief.json — "${hint}".`);
  seedFromBrief(rec.id, b);

  if (opts.importPrior) {
    log.info("init", "Folding in prior research/decisions from this folder…");
    await importPriorWork(cfg, rec.id);
  } else {
    log.raw(`  Seeded with niche/ICP/budget/stack from the brief.`);
    log.raw(`  To also pull in prior research/decisions: npm run forge -- idea import ${rec.id}`);
    log.raw(`  Then run it: npm run forge -- idea run ${rec.id}`);
  }
  return rec.id;
}
