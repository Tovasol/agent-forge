// src/harness/scheduler.ts
// `forge watch` — the "always has work" loop, done responsibly. It runs one
// growth cycle, sleeps for the configured interval, and repeats. It is bounded,
// budget-aware, and gate-aware: when there's nothing actionable (everything is
// parked on human approval), it backs off rather than busy-spinning, and it
// stops on the budget cap. This is the cron-style cadence, not a `while true`.

import type { ForgeConfig } from "../lib/types.js";
import { log } from "../lib/log.js";
import { runGrowthCycle } from "../agents/grow.js";
import { loadState } from "./memory.js";
import { BudgetExceeded } from "./budget.js";
import { pendingApprovals } from "./backlog.js";

export interface WatchOptions {
  intervalMinutes: number; // base cadence between cycles
  maxCycles?: number; // stop after N cycles (default: run until budget/ctrl-c)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function watch(cfg: ForgeConfig, opts: WatchOptions) {
  const base = Math.max(1, opts.intervalMinutes) * 60_000;
  let idleStreak = 0;
  let cycles = 0;

  log.info(
    "watch",
    `Starting growth loop: one cycle every ${opts.intervalMinutes}m. ` +
      `Budget cap $${cfg.maxBudgetUsd} (apikey mode). Ctrl-C to stop.`
  );

  // Graceful stop.
  let stop = false;
  process.on("SIGINT", () => {
    log.warn("watch", "Stopping after this cycle…");
    stop = true;
  });

  while (!stop) {
    cycles++;
    try {
      const summary = await runGrowthCycle(cfg);
      const noWork = summary.startsWith("No actionable");
      idleStreak = noWork ? idleStreak + 1 : 0;

      if (noWork) {
        const pend = pendingApprovals().length;
        if (pend) {
          log.info(
            "watch",
            `Everything actionable is done; ${pend} item(s) await your approval. ` +
              `Backing off — run \`npm run approvals\`.`
          );
        }
      }
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        log.error("watch", e.message + " — stopping the loop.");
        return;
      }
      log.error("watch", "Cycle error: " + (e as Error).message);
      idleStreak++;
    }

    if (opts.maxCycles && cycles >= opts.maxCycles) {
      log.ok("watch", `Reached maxCycles=${opts.maxCycles}. Stopping.`);
      return;
    }
    if (stop) break;

    // Exponential backoff when idle (parked on approvals) so we don't spin.
    const backoff = Math.min(8, 2 ** Math.min(idleStreak, 3));
    const waitMs = idleStreak > 0 ? base * backoff : base;
    const spend = loadState().totalCostUsd;
    log.info(
      "watch",
      `Cycle ${cycles} done (run spend ~$${spend.toFixed(2)}). Next in ${Math.round(waitMs / 60000)}m.`
    );
    await sleep(waitMs);
  }
  log.ok("watch", "Growth loop stopped.");
}
