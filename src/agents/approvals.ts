// src/agents/approvals.ts
// Interactive review of gated items. The operator approves or rejects each
// prepared action that contacts a named person or spends money. Approving marks
// the task ready for the human to execute (the framework never sends/posts to
// third-party platforms itself — that stays in the operator's hands by design).

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "../lib/log.js";
import {
  loadApprovals,
  saveApprovals,
  pendingApprovals,
  getTask,
  upsertTask,
} from "../harness/backlog.js";

export async function reviewApprovals(): Promise<void> {
  const pend = pendingApprovals();
  if (!pend.length) {
    log.ok("approvals", "Nothing awaiting approval. The agent is clear to keep working.");
    return;
  }
  log.raw(`\n${pend.length} item(s) awaiting your approval.\n`);

  if (!stdin.isTTY) {
    // Non-interactive: just list them.
    for (const a of pend) {
      log.raw(`• [${a.channel}] ${a.title}`);
      log.raw(`    why gated: ${a.gateReason}${a.estimatedCostUsd ? `  cost ~$${a.estimatedCostUsd}` : ""}`);
      log.raw(`    draft: ${a.payloadPath}`);
      log.raw(`    ${a.summary}\n`);
    }
    log.warn("approvals", "Run in an interactive terminal to approve/reject.");
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const all = loadApprovals();
    for (const a of all) {
      if (a.decided) continue;
      log.raw(`\n──────────────────────────────────────────────`);
      log.raw(`[${a.channel}] ${a.title}`);
      log.raw(`Why gated: ${a.gateReason}${a.estimatedCostUsd ? `   est cost: $${a.estimatedCostUsd}` : ""}`);
      log.raw(`What you're approving: ${a.summary}`);
      const full = resolve(process.cwd(), a.payloadPath);
      if (existsSync(full)) {
        log.raw(`\n--- drafted artifact (${a.payloadPath}) ---`);
        log.raw(readFileSync(full, "utf8").slice(0, 2000));
        log.raw(`--- end ---`);
      }
      const ans = (await rl.question("\n[a]pprove  [r]eject  [s]kip ? ")).trim().toLowerCase();
      if (ans === "a") {
        a.decided = "approved";
        a.decidedAt = new Date().toISOString();
        const t = getTask(a.taskId);
        if (t) {
          t.status = "approved";
          t.notes.push("Approved by operator — ready for you to send/post.");
          upsertTask(t);
        }
        log.ok("approvals", "Approved. It's ready for you to execute manually.");
      } else if (ans === "r") {
        a.decided = "rejected";
        a.decidedAt = new Date().toISOString();
        const t = getTask(a.taskId);
        if (t) {
          t.status = "skipped";
          t.notes.push("Rejected by operator.");
          upsertTask(t);
        }
        log.warn("approvals", "Rejected.");
      } else {
        log.info("approvals", "Skipped — still pending.");
      }
    }
    saveApprovals(all);
  } finally {
    rl.close();
  }
  log.raw("");
}
