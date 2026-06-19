// src/harness/budget.ts
// Tracks estimated spend across a run and aborts if the cap is exceeded.
// Only meaningful under apikey auth (subscription usage isn't dollar-metered
// locally), but we still surface a running tally for visibility.

import type { ForgeConfig } from "../lib/types.js";
import { loadState, addCost } from "./memory.js";
import { log } from "../lib/log.js";

export class BudgetExceeded extends Error {}

export function recordSpend(cfg: ForgeConfig, usd?: number) {
  if (typeof usd !== "number") return;
  const s = loadState();
  addCost(s, usd);
  const total = loadState().totalCostUsd;
  log.info("budget", `+ $${usd.toFixed(4)}  (run total ~ $${total.toFixed(4)})`);
  if (cfg.auth === "apikey" && total > cfg.maxBudgetUsd) {
    throw new BudgetExceeded(
      `Run spend ~$${total.toFixed(2)} exceeded cap $${cfg.maxBudgetUsd}. Aborting. ` +
        `Raise FORGE_MAX_BUDGET_USD to continue.`
    );
  }
}
