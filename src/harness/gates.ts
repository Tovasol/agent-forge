// src/harness/gates.ts
// Human-in-the-loop gates. In "gated" autonomy the loop runs freely but stops
// here before anything that spends money or ships to production. The gate is a
// blocking terminal prompt; in non-interactive contexts it records the pending
// gate to state and exits so a human can re-run `forge resume` after deciding.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Autonomy, GateRequest, Phase } from "../lib/types.js";
import { log } from "../lib/log.js";
import { loadState, saveState } from "./memory.js";

export class GateBlocked extends Error {
  constructor(public request: GateRequest) {
    super(`Gate blocked: ${request.title}`);
  }
}

function gateApplies(autonomy: Autonomy, kind: GateRequest["kind"]): boolean {
  if (autonomy === "phased") return true; // pause at every gate, including phase
  if (autonomy === "research-only") return true;
  // "gated": only stop for spend + deploy, glide through phase gates
  return kind === "spend" || kind === "deploy";
}

export async function requestGate(
  autonomy: Autonomy,
  req: GateRequest
): Promise<boolean> {
  if (!gateApplies(autonomy, req.kind)) {
    log.info("gate", `Auto-passing ${req.kind} gate: ${req.title}`);
    return true;
  }

  const costLine =
    typeof req.estimatedCostUsd === "number"
      ? `\nEstimated cost: $${req.estimatedCostUsd.toFixed(2)}`
      : "";
  log.gate(`${req.title}\n\n${req.detail}${costLine}`);

  // Non-interactive (e.g. piped/CI): persist the pending gate and stop.
  if (!stdin.isTTY) {
    const s = loadState();
    s.pendingGate = {
      kind: req.kind,
      phase: req.phase,
      title: req.title,
      detail: req.detail,
      estimatedCostUsd: req.estimatedCostUsd,
    };
    saveState(s);
    log.warn(
      "gate",
      "Non-interactive shell detected. Pending gate saved. Review memory/progress.md, then run `npm run resume`."
    );
    throw new GateBlocked(req);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question("Approve and continue? [y/N] ")).trim().toLowerCase();
    const ok = answer === "y" || answer === "yes";
    if (ok) {
      const s = loadState();
      s.pendingGate = null;
      saveState(s);
      log.ok("gate", "Approved.");
    } else {
      log.warn("gate", "Declined. Stopping here. Re-run when ready.");
    }
    return ok;
  } finally {
    rl.close();
  }
}

export function clearPendingGate(phase?: Phase) {
  const s = loadState();
  if (!s.pendingGate) return;
  if (!phase || s.pendingGate.phase === phase) {
    s.pendingGate = null;
    saveState(s);
  }
}
