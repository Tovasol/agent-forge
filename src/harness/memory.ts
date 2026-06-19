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
  rmSync,
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

/**
 * Re-open phases for another improvement pass WITHOUT losing artifacts. Removes
 * the given phases from completedPhases so the loop runs them again; because
 * each phase is idempotent-by-inspection (research resumes/fills gaps, build
 * inspects & improves in place, decide re-evaluates), this improves rather than
 * rebuilds. Pass the phases you want re-examined.
 */
export function reopenPhases(phases: Phase[]): RunState {
  const s = loadState();
  s.completedPhases = s.completedPhases.filter((p) => !phases.includes(p));
  s.currentPhase = null;
  saveState(s);
  return s;
}

/** The most recent optimization proposal text, if any (from recorded notes). */
export function lastProposal(): string | null {
  const s = loadState();
  const notes = (s.log ?? []).filter((n) => /^Proposal:/.test(n.note));
  if (!notes.length) return null;
  return notes[notes.length - 1].note.replace(/^Proposal:\s*/, "").trim();
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

/** Remove a saved finding so its facet re-runs next round (used when sharpening). */
export function deleteFinding(workerId: string): void {
  const path = resolve(MEM, "findings", `${workerId}.json`);
  if (existsSync(path)) rmSync(path);
}

// ── Raw source ledger (DISK-ONLY tier) ───────────────────────────────────────
// Persists every source that produced a material claim, so future research can
// skip what's already covered. Append-only; never loaded into the prompt context.
const SOURCES = () => resolve(MEM, "research", "sources.json");

export function appendSources(records: import("../lib/types.js").SourceRecord[]): void {
  if (!records.length) return;
  const path = SOURCES();
  ensureDir(path);
  const existing: import("../lib/types.js").SourceRecord[] = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : [];
  const seen = new Set(existing.map((r) => r.url));
  for (const r of records) if (!seen.has(r.url)) { existing.push(r); seen.add(r.url); }
  writeFileSync(path, JSON.stringify(existing, null, 2));
}

export function loadSourceUrls(): Set<string> {
  const path = SOURCES();
  if (!existsSync(path)) return new Set();
  const recs: import("../lib/types.js").SourceRecord[] = JSON.parse(readFileSync(path, "utf8"));
  return new Set(recs.map((r) => r.url));
}

export function sourceCount(): number {
  const path = SOURCES();
  if (!existsSync(path)) return 0;
  return (JSON.parse(readFileSync(path, "utf8")) as unknown[]).length;
}

// ── Research synthesis (distilled tier the pipeline consumes) ─────────────────
export function saveSynthesis(s: import("../lib/types.js").ResearchSynthesis): string {
  const path = resolve(MEM, "research", "synthesis.json");
  ensureDir(path);
  writeFileSync(path, JSON.stringify(s, null, 2));
  // human-readable mirror
  const md = [
    `# Research synthesis`,
    `_Built ${s.builtAt}. ${s.saturationNote}_`,
    ``,
    `## Key findings`,
    ...s.keyFindings.map((f) => `- ${f}`),
    ``,
    `## Conclusions`,
    ...s.conclusions.map((c) => `- ${c}`),
    ``,
    `## Recommended next actions`,
    ...s.nextActions.map((a) => `- ${a}`),
    ``,
    `_Facets covered: ${s.facetsCovered.join(", ")}_`,
  ].join("\n");
  writeFileSync(resolve(MEM, "research", "synthesis.md"), md);
  return path;
}

export function loadSynthesis(): import("../lib/types.js").ResearchSynthesis | null {
  const path = resolve(MEM, "research", "synthesis.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

// ── Research plan persistence (for cross-run idempotency) ─────────────────────
// The plan is an LLM output, so it must persist — otherwise a re-run re-plans
// with different facet ids and the checkpoint-skip can't match, redoing work.
const PLAN_PATH = () => resolve(MEM, "research", "plan.json");

export function savePlan(specs: import("../lib/types.js").WorkerSpec[]): void {
  const p = PLAN_PATH();
  ensureDir(p);
  writeFileSync(p, JSON.stringify(specs, null, 2));
}

export function loadPlan(): import("../lib/types.js").WorkerSpec[] | null {
  const p = PLAN_PATH();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Remove only the persisted research plan so research RE-PLANS (keeps the
 *  source ledger as reference). Used when a directive pivots the research lens. */
export function clearResearchPlan(): void {
  const p = PLAN_PATH();
  if (existsSync(p)) rmSync(p);
}

// ── Deployed site URL (captured from the deploy, so we don't ask the operator) ─
const DEPLOY_URL_PATH = () => resolve(MEM, "deploy", "live-url.txt");

/** Absolute path the deploy agent writes its discovered live URL to. */
export function deployedUrlPath(): string {
  return DEPLOY_URL_PATH();
}

export function saveDeployedUrl(url: string): void {
  const p = DEPLOY_URL_PATH();
  ensureDir(p);
  writeFileSync(p, url.trim() + "\n");
}

/** The live URL captured at deploy time, if any (sanitized to a single https URL). */
export function loadDeployedUrl(): string {
  const p = DEPLOY_URL_PATH();
  if (!existsSync(p)) return "";
  const raw = readFileSync(p, "utf8").trim();
  const m = raw.match(/https?:\/\/[^\s"')]+/);
  return m ? m[0] : "";
}

/** Wipe all research artifacts for a clean restart (`--fresh`). */
export function clearResearch(): void {
  const dir = resolve(MEM, "research");
  const findingsDir = resolve(MEM, "findings");
  for (const d of [dir]) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  if (existsSync(findingsDir)) {
    for (const f of readdirSync(findingsDir)) if (f.endsWith(".json")) rmSync(resolve(findingsDir, f));
  }
}

/**
 * A compact digest of what's already been researched — known claims (capped)
 * and source URLs with dates — so a worker can SKIP covered ground and only
 * fill gaps / refresh stale items. Bounded to keep the prompt small.
 */
export function coverageDigest(maxClaims = 40): string {
  const findings = loadFindings();
  if (!findings.length) return "";
  const claims: string[] = [];
  for (const f of findings) {
    for (const c of f.claims ?? []) {
      claims.push(`- (${f.workerId}) ${c.statement}`);
      if (claims.length >= maxClaims) break;
    }
    if (claims.length >= maxClaims) break;
  }
  const srcPath = SOURCES();
  let srcLine = "";
  if (existsSync(srcPath)) {
    const recs: import("../lib/types.js").SourceRecord[] = JSON.parse(readFileSync(srcPath, "utf8"));
    const dates = recs.map((r) => r.fetchedAt).sort();
    srcLine = `\n${recs.length} sources already consulted` + (dates.length ? ` (oldest ${dates[0].slice(0, 10)}, newest ${dates[dates.length - 1].slice(0, 10)}).` : ".");
  }
  return `ALREADY ESTABLISHED (do not re-derive — only fill gaps or refresh if stale):\n${claims.join("\n")}${srcLine}`;
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
