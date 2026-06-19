// src/harness/memory.ts
// Durable, file-based memory. This is the backbone of persistence: every phase
// writes its progress here so a fresh process (or a fresh agent context) can
// resume exactly where it left off — the long-running-harness pattern.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import type { Phase, Finding, Decision } from "../lib/types.js";

const ROOT = resolve(process.cwd());
const MEM = resolve(ROOT, "memory");
const STATE_PATH = resolve(MEM, "state.json");
const PROGRESS_PATH = resolve(MEM, "progress.md");

export interface RunState {
  startedAt: string;
  updatedAt: string;
  completedPhases: Phase[];
  currentPhase: Phase | null;
  pendingGate: null | {
    kind: string;
    phase: Phase;
    title: string;
    detail: string;
    estimatedCostUsd?: number;
  };
  totalCostUsd: number;
  log: Array<{ at: string; phase: Phase | "system"; note: string }>;
}

function ensureDir(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}

export function defaultState(): RunState {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    updatedAt: now,
    completedPhases: [],
    currentPhase: null,
    pendingGate: null,
    totalCostUsd: 0,
    log: [],
  };
}

export function loadState(): RunState {
  if (!existsSync(STATE_PATH)) return defaultState();
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as RunState;
  } catch {
    return defaultState();
  }
}

export function saveState(s: RunState): void {
  ensureDir(STATE_PATH);
  s.updatedAt = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
  writeProgressMd(s);
}

export function recordNote(s: RunState, phase: Phase | "system", note: string) {
  s.log.push({ at: new Date().toISOString(), phase, note });
  saveState(s);
}

export function markPhaseComplete(s: RunState, phase: Phase) {
  if (!s.completedPhases.includes(phase)) s.completedPhases.push(phase);
  s.currentPhase = null;
  saveState(s);
}

export function addCost(s: RunState, usd?: number) {
  if (typeof usd === "number" && Number.isFinite(usd)) {
    s.totalCostUsd = Math.round((s.totalCostUsd + usd) * 1e6) / 1e6;
    saveState(s);
  }
}

// ── Findings ─────────────────────────────────────────────────────────────────
export function saveFinding(f: Finding): string {
  const path = resolve(MEM, "findings", `${f.workerId}.json`);
  ensureDir(path);
  writeFileSync(path, JSON.stringify(f, null, 2));
  return path;
}

export function loadFindings(): Finding[] {
  const dir = resolve(MEM, "findings");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Finding);
}

// ── Decisions ────────────────────────────────────────────────────────────────
export function saveDecision(d: Decision): string {
  const path = resolve(MEM, "decisions", `${d.id}.json`);
  ensureDir(path);
  writeFileSync(path, JSON.stringify(d, null, 2));
  return path;
}

export function loadDecisions(): Decision[] {
  const dir = resolve(MEM, "decisions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Decision);
}

// ── Human-readable progress mirror ───────────────────────────────────────────
function writeProgressMd(s: RunState) {
  const lines: string[] = [];
  lines.push(`# Agent Forge — progress`);
  lines.push("");
  lines.push(`- Started: ${s.startedAt}`);
  lines.push(`- Updated: ${s.updatedAt}`);
  lines.push(`- Completed phases: ${s.completedPhases.join(", ") || "(none)"}`);
  lines.push(`- Current phase: ${s.currentPhase ?? "(idle)"}`);
  lines.push(`- Estimated spend so far: $${s.totalCostUsd.toFixed(4)}`);
  if (s.pendingGate) {
    lines.push("");
    lines.push(`## ⏸ Pending gate: ${s.pendingGate.title}`);
    lines.push(s.pendingGate.detail);
  }
  lines.push("");
  lines.push(`## Activity log`);
  for (const e of s.log.slice(-40)) {
    lines.push(`- \`${e.at}\` **${e.phase}** — ${e.note}`);
  }
  lines.push("");
  ensureDir(PROGRESS_PATH);
  writeFileSync(PROGRESS_PATH, lines.join("\n"));
}
