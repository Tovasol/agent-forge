// src/harness/venture-gates.ts
// Human-in-the-loop gates for the venture engine. The engine runs autonomously
// between gates and stops at exactly the irreducible human actions: strategic
// direction (niche/model), money, identity, legal, contact, taste. Everything
// the human needs is pre-staged so their action is essentially one click.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "../lib/log.js";
import type { GateType, StageId } from "../lib/venture-types.js";
import { enqueueGate, loadGates, saveGates, pendingGates } from "./venture-state.js";

const GATE_BLURB: Record<GateType, string> = {
  strategic: "A direction choice only you should make. The engine has researched the options and recommends one.",
  money: "This spends money. The engine prepared everything; you authorize the payment.",
  identity: "This requires your real identity (KYC/registration/banking). Only you can complete it.",
  legal: "This is a legal act (entity, contract, tax). The engine drafted it; you review and sign.",
  contact: "This reaches a named person. The engine drafted it; you send it from your own account.",
  taste: "A subjective brand/taste call. The engine offers options; you pick.",
  none: "",
};

export function stageGate(
  stage: StageId,
  gateType: GateType,
  title: string,
  whatYouDo: string,
  prepared: string[],
  estimatedCostUsd?: number
) {
  if (gateType === "none") return;
  enqueueGate({
    id: `vgate-${stage}-${gateType}-${Date.now()}`,
    stage,
    gateType,
    title,
    whatYouDo,
    whyGated: GATE_BLURB[gateType],
    prepared,
    estimatedCostUsd,
    createdAt: new Date().toISOString(),
  });
}

/** Review all pending venture gates interactively. */
export async function reviewVentureGates(): Promise<void> {
  const pend = pendingGates();
  if (!pend.length) {
    log.ok("gates", "Nothing awaiting you. The engine is clear to keep driving.");
    return;
  }
  log.raw(`\n${pend.length} item(s) need you before the engine can proceed.\n`);

  if (!stdin.isTTY) {
    for (const g of pend) {
      log.raw(`• [${g.gateType}] ${g.title}`);
      log.raw(`    you do: ${g.whatYouDo}`);
      if (g.estimatedCostUsd) log.raw(`    cost: ~$${g.estimatedCostUsd}`);
      for (const p of g.prepared) log.raw(`    prepared: ${p}`);
      log.raw("");
    }
    log.warn("gates", "Run in an interactive terminal to approve/reject.");
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const all = loadGates();
    for (const g of all) {
      if (g.decided) continue;
      log.raw(`\n──────────────────────────────────────────────`);
      log.raw(`[${g.gateType}] ${g.title}`);
      log.raw(g.whyGated);
      log.raw(`\nYou do: ${g.whatYouDo}`);
      if (g.estimatedCostUsd) log.raw(`Est. cost: $${g.estimatedCostUsd}`);
      for (const p of g.prepared) {
        const full = resolve(process.cwd(), p);
        if (existsSync(full)) {
          log.raw(`\n--- ${p} ---`);
          log.raw(readFileSync(full, "utf8").slice(0, 1800));
          log.raw(`--- end ---`);
        } else {
          log.raw(`  prepared: ${p}`);
        }
      }
      const ans = (await rl.question("\n[a]pprove/done   [r]eject   [s]kip ? ")).trim().toLowerCase();
      if (ans === "a") {
        g.decided = "approved";
        g.decidedAt = new Date().toISOString();
        log.ok("gates", "Approved.");
      } else if (ans === "r") {
        g.decided = "rejected";
        g.decidedAt = new Date().toISOString();
        log.warn("gates", "Rejected.");
      } else {
        log.info("gates", "Skipped — still pending.");
      }
    }
    saveGates(all);
  } finally {
    rl.close();
  }
  log.raw("\nWhen gates are cleared, run `npm run venture:resume` to continue.\n");
}
