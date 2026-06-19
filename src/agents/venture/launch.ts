// src/agents/venture/launch.ts
// `forge venture launch "<hint>"` — start a new venture from the smallest hint,
// or report status / resume an existing one.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { ForgeConfig } from "../../lib/types.js";
import { log } from "../../lib/log.js";
import { STAGE_ORDER } from "../../lib/venture-types.js";
import {
  hasVenture,
  loadVenture,
  saveVenture,
  newVenture,
  journal,
  pendingGates,
} from "../../harness/venture-state.js";
import { driveVenture } from "./orchestrator.js";
import { buildProfile } from "./profile.js";
import { contextDirExists } from "../../harness/context-loader.js";

export async function launchVenture(cfg: ForgeConfig, hint: string): Promise<void> {
  if (hasVenture()) {
    const existing = loadVenture();
    log.warn(
      "venture",
      `A venture already exists (${existing?.ventureId}, hint: "${existing?.hint}"). ` +
        "Resume it with `npm run venture:resume`, or delete memory/venture/ to start fresh."
    );
    return;
  }
  if (!hint || !hint.trim()) {
    log.error("venture", 'Give a hint: npm run venture -- launch "something with data pipelines"');
    return;
  }

  // Set the affordable-loss ceiling — the one number that bounds all autonomous spend prep.
  let affordable = cfg.brief.monthlyBudgetUsd * 6; // sensible default
  if (stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const ans = (
        await rl.question(
          `Affordable-loss ceiling for this venture (max you're willing to lose) [$${affordable}]: `
        )
      ).trim();
      const n = parseFloat(ans.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n > 0) affordable = n;
    } finally {
      rl.close();
    }
  }

  const v = newVenture(hint.trim(), affordable);
  saveVenture(v);
  journal(v, "system", `Venture created from hint: "${hint.trim()}" (affordable loss $${affordable}).`);
  log.ok("venture", `Created ${v.ventureId}. Driving the pipeline…`);

  // Build the operator profile from context/ (resumes + assets) so every stage
  // can leverage the operator's real skills and owned assets.
  if (contextDirExists()) {
    log.info("venture", "Found files in context/ — building your operator profile first.");
  } else {
    log.info("venture", "No context/ files; profiling from declared assets. (Drop resumes + assets.txt in context/ for a richer profile.)");
  }
  await buildProfile(cfg, { force: true });

  log.info("venture", "It will run autonomously and stop only when it needs you (niche/model approval, spend, identity, legal, contact, taste).");

  await driveVenture(cfg);
}

export async function resumeVenture(cfg: ForgeConfig): Promise<void> {
  if (!hasVenture()) {
    log.error("venture", 'No venture to resume. Start one: npm run venture -- launch "<hint>"');
    return;
  }
  await driveVenture(cfg);
}

export function ventureStatus(): void {
  const v = loadVenture();
  if (!v) {
    log.raw("No venture yet. Start one: npm run venture -- launch \"<hint>\"");
    return;
  }
  log.raw(`\nVenture ${v.ventureId}`);
  log.raw(`  Hint:            ${v.hint}`);
  log.raw(`  Affordable loss: $${v.affordableLossUsd}`);
  log.raw(`  Est. spend:      $${v.totalSpendUsd.toFixed(2)}`);
  log.raw(`  Current stage:   ${v.currentStage ?? "(none)"}`);
  log.raw(`\n  Pipeline:`);
  for (const id of STAGE_ORDER) {
    const s = v.stages[id];
    const mark =
      s.status === "complete" ? "✓" : s.status === "in-progress" ? "▶" : s.status === "blocked-on-gate" ? "⏸" : s.status === "skipped" ? "–" : "·";
    log.raw(`    ${mark} ${id.padEnd(16)} ${s.status}`);
  }
  const pend = pendingGates();
  log.raw(`\n  ${pend.length} item(s) awaiting you.` + (pend.length ? " Run `npm run venture:gates`." : ""));
  log.raw(`  Full journal: memory/venture/journal.md\n`);
}
