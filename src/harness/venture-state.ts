// src/harness/venture-state.ts
// Persistent, resumable state for a venture run. This is what lets the engine
// stop and continue across many sessions: everything is JSON + a human-readable
// journal on disk under memory/venture/.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import type {
  VentureState,
  StageId,
  StageRecord,
  DecisionBrief,
  VentureGate,
} from "../lib/venture-types.js";
import { STAGE_ORDER } from "../lib/venture-types.js";

const ROOT = resolve(process.cwd());
const VEN = resolve(ROOT, "memory/venture");
const STATE = resolve(VEN, "state.json");
const JOURNAL = resolve(VEN, "journal.md");
const BRIEFS = resolve(VEN, "briefs");
const GATES = resolve(VEN, "gates.json");
const ARTIFACTS = resolve(VEN, "artifacts");

function ensure(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}

function emptyStages(): Record<StageId, StageRecord> {
  const out = {} as Record<StageId, StageRecord>;
  for (const id of STAGE_ORDER) {
    out[id] = { id, status: "pending", artifacts: [], decisionBriefIds: [], notes: [] };
  }
  return out;
}

export function newVenture(hint: string, affordableLossUsd: number): VentureState {
  const now = new Date().toISOString();
  return {
    ventureId: `v-${Date.now().toString(36)}`,
    hint,
    createdAt: now,
    updatedAt: now,
    currentStage: null,
    stages: emptyStages(),
    pendingGateId: null,
    affordableLossUsd,
    totalSpendUsd: 0,
    journal: [],
  };
}

export function hasVenture(): boolean {
  return existsSync(STATE);
}

export function loadVenture(): VentureState | null {
  if (!existsSync(STATE)) return null;
  try {
    return JSON.parse(readFileSync(STATE, "utf8")) as VentureState;
  } catch {
    return null;
  }
}

export function saveVenture(v: VentureState): void {
  ensure(STATE);
  v.updatedAt = new Date().toISOString();
  writeFileSync(STATE, JSON.stringify(v, null, 2));
  writeJournal(v);
}

export function journal(v: VentureState, stage: StageId | "system", note: string) {
  v.journal.push({ at: new Date().toISOString(), stage, note });
  saveVenture(v);
}

// ── Decision briefs ──────────────────────────────────────────────────────────
export function saveBrief(b: DecisionBrief): string {
  const path = resolve(BRIEFS, `${b.id}.json`);
  ensure(path);
  writeFileSync(path, JSON.stringify(b, null, 2));
  return path.replace(ROOT + "/", "");
}
export function loadBriefs(): DecisionBrief[] {
  if (!existsSync(BRIEFS)) return [];
  return readdirSync(BRIEFS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(BRIEFS, f), "utf8")) as DecisionBrief);
}

// ── Gates ────────────────────────────────────────────────────────────────────
export function loadGates(): VentureGate[] {
  if (!existsSync(GATES)) return [];
  try {
    return JSON.parse(readFileSync(GATES, "utf8")) as VentureGate[];
  } catch {
    return [];
  }
}
export function saveGates(gates: VentureGate[]) {
  ensure(GATES);
  writeFileSync(GATES, JSON.stringify(gates, null, 2));
}
export function enqueueGate(g: VentureGate) {
  const all = loadGates();
  if (!all.find((x) => x.id === g.id)) all.push(g);
  saveGates(all);
}
export function pendingGates(): VentureGate[] {
  return loadGates().filter((g) => !g.decided);
}

// ── Artifacts ────────────────────────────────────────────────────────────────
export function writeVentureArtifact(stage: StageId, name: string, content: string): string {
  const safe = `${stage}--${name.replace(/[^a-z0-9.\-_]/gi, "-")}`;
  const path = resolve(ARTIFACTS, safe);
  ensure(path);
  writeFileSync(path, content);
  return path.replace(ROOT + "/", "");
}
export function readVentureArtifacts(): Record<string, string> {
  if (!existsSync(ARTIFACTS)) return {};
  const out: Record<string, string> = {};
  for (const f of readdirSync(ARTIFACTS)) {
    out[f] = readFileSync(resolve(ARTIFACTS, f), "utf8");
  }
  return out;
}

// ── Human-readable journal mirror ────────────────────────────────────────────
function writeJournal(v: VentureState) {
  const lines: string[] = [];
  lines.push(`# Venture journal — ${v.ventureId}`);
  lines.push("");
  lines.push(`**Hint:** ${v.hint}`);
  lines.push(`**Affordable-loss ceiling:** $${v.affordableLossUsd}`);
  lines.push(`**Started:** ${v.createdAt}  |  **Updated:** ${v.updatedAt}`);
  lines.push(`**Estimated spend so far:** $${v.totalSpendUsd.toFixed(2)}`);
  lines.push("");
  lines.push(`## Pipeline`);
  for (const id of STAGE_ORDER) {
    const s = v.stages[id];
    const mark =
      s.status === "complete" ? "✓" : s.status === "in-progress" ? "▶" : s.status === "blocked-on-gate" ? "⏸" : s.status === "skipped" ? "–" : "·";
    lines.push(`- ${mark} **${id}** — ${s.status}${v.currentStage === id ? "  ← current" : ""}`);
  }
  const pend = pendingGates();
  if (pend.length) {
    lines.push("");
    lines.push(`## ⏸ Awaiting you (${pend.length})`);
    for (const g of pend) {
      lines.push(`- **[${g.gateType}]** ${g.title} — ${g.whatYouDo}` + (g.estimatedCostUsd ? ` (~$${g.estimatedCostUsd})` : ""));
    }
    lines.push("");
    lines.push("Run `npm run venture:gates` to review and approve.");
  }
  lines.push("");
  lines.push(`## Journal`);
  for (const e of v.journal.slice(-50)) {
    lines.push(`- \`${e.at}\` **${e.stage}** — ${e.note}`);
  }
  lines.push("");
  ensure(JOURNAL);
  writeFileSync(JOURNAL, lines.join("\n"));
}
