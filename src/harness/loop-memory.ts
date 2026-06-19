// src/harness/loop-memory.ts
// Three-layer memory for the codified loop, namespaced per IDEA so a generic
// framework specializes to a specific venture and accumulates learnings:
//
//   SEMANTIC   — durable facts about THIS idea (ICP, niche, prices, channel results,
//                the live metrics bag that gate predicates read).
//   EPISODIC   — timestamped events/outcomes (stage results, test metrics, lessons).
//   PROCEDURAL — the versioned loop spec itself (lives in loop-spec-store.ts); the
//                meta-loop edits it. Cloned per-idea here so each idea can carry its
//                own evolved process while the global seed stays intact.
//
// Layout (per idea):
//   memory/loop/ideas/<ideaId>/semantic.json     ← facts + MetricsBag
//   memory/loop/ideas/<ideaId>/episodic.jsonl    ← append-only event log
//   memory/loop/ideas/<ideaId>/spec.json         ← this idea's procedural spec (clone)
//   memory/loop/ideas/<ideaId>/artifacts/        ← deliverables produced per stage
//   memory/loop/ideas/<ideaId>/idea.json         ← intake record (hint, status, cursor)

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { LoopSpec, MetricsBag } from "../lib/loop-schema.js";
import { seedSpec } from "../lib/loop-seed.js";
import { loadSpec } from "./loop-spec-store.js";

const BASE = () => resolve(process.cwd(), "memory/loop/ideas");
const ideaDir = (id: string) => resolve(BASE(), id);

function ensure(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}
function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

// ── Idea identity & lifecycle ────────────────────────────────────────────────
export interface IdeaRecord {
  id: string;
  hint: string;
  createdAt: string;
  status: "active" | "killed" | "shipped";
  currentStage: string; // stage id the executor is on
  completedStages: string[];
  killReason?: string;
}

export function slugifyIdea(hint: string): string {
  const base = hint.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "idea";
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

/** Create a new idea: clone the generic procedural spec into the idea namespace. */
export function createIdea(hint: string): IdeaRecord {
  const id = slugifyIdea(hint);
  const dir = ideaDir(id);
  ensureDir(dir);
  ensureDir(resolve(dir, "artifacts"));
  // Procedural memory: clone the current GLOBAL spec so this idea evolves its own.
  const spec = loadSpec();
  writeFileSync(resolve(dir, "spec.json"), JSON.stringify(spec, null, 2));
  // Semantic memory: empty facts + metrics bag.
  writeFileSync(resolve(dir, "semantic.json"), JSON.stringify({ facts: {}, metrics: {} }, null, 2));
  const rec: IdeaRecord = {
    id,
    hint,
    createdAt: new Date().toISOString(),
    status: "active",
    currentStage: spec.stages.sort((a, b) => a.order - b.order)[0].id,
    completedStages: [],
  };
  writeFileSync(resolve(dir, "idea.json"), JSON.stringify(rec, null, 2));
  episodic(id).add("intake", `Idea created from hint: "${hint}". Procedural spec v${spec.specVersion} cloned.`);
  return rec;
}

export function loadIdea(id: string): IdeaRecord | null {
  const f = resolve(ideaDir(id), "idea.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}
export function saveIdea(rec: IdeaRecord): void {
  writeFileSync(resolve(ideaDir(rec.id), "idea.json"), JSON.stringify(rec, null, 2));
}
export function listIdeas(): IdeaRecord[] {
  const base = BASE();
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((d) => loadIdea(d))
    .filter((x): x is IdeaRecord => !!x);
}

/** The most recently created active idea (convenience for CLI without an id). */
export function activeIdea(): IdeaRecord | null {
  const ideas = listIdeas().filter((i) => i.status === "active");
  if (!ideas.length) return null;
  return ideas.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

// ── Procedural memory (per-idea spec clone) ──────────────────────────────────
export function loadIdeaSpec(id: string): LoopSpec {
  const f = resolve(ideaDir(id), "spec.json");
  if (!existsSync(f)) {
    const spec = seedSpec();
    ensure(f);
    writeFileSync(f, JSON.stringify(spec, null, 2));
    return spec;
  }
  return JSON.parse(readFileSync(f, "utf8"));
}
export function saveIdeaSpec(id: string, spec: LoopSpec): void {
  writeFileSync(resolve(ideaDir(id), "spec.json"), JSON.stringify(spec, null, 2));
}

// ── Semantic memory (facts + metrics bag) ────────────────────────────────────
interface SemanticStore {
  facts: Record<string, unknown>;
  metrics: MetricsBag;
}
function loadSemantic(id: string): SemanticStore {
  const f = resolve(ideaDir(id), "semantic.json");
  if (!existsSync(f)) return { facts: {}, metrics: {} };
  return JSON.parse(readFileSync(f, "utf8"));
}
function saveSemantic(id: string, s: SemanticStore): void {
  const f = resolve(ideaDir(id), "semantic.json");
  ensure(f);
  writeFileSync(f, JSON.stringify(s, null, 2));
}
export function getMetrics(id: string): MetricsBag {
  return loadSemantic(id).metrics;
}
/** Merge updates into the metrics bag (what gate predicates read). */
export function updateMetrics(id: string, patch: MetricsBag): MetricsBag {
  const s = loadSemantic(id);
  s.metrics = { ...s.metrics, ...patch };
  saveSemantic(id, s);
  return s.metrics;
}
export function setFact(id: string, key: string, value: unknown): void {
  const s = loadSemantic(id);
  s.facts[key] = value;
  saveSemantic(id, s);
}
export function getFacts(id: string): Record<string, unknown> {
  return loadSemantic(id).facts;
}

// ── Episodic memory (append-only event log) ──────────────────────────────────
export interface Episode {
  at: string;
  stage: string;
  kind: "event" | "lesson" | "metric" | "verdict";
  text: string;
}
export function episodic(id: string) {
  const f = resolve(ideaDir(id), "episodic.jsonl");
  return {
    add(stage: string, text: string, kind: Episode["kind"] = "event") {
      ensure(f);
      const e: Episode = { at: new Date().toISOString(), stage, kind, text };
      appendFileSync(f, JSON.stringify(e) + "\n");
    },
    all(): Episode[] {
      if (!existsSync(f)) return [];
      return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
    /** Lessons (Reflexion-style) to prepend on re-runs of a stage. */
    lessonsFor(stage: string): string[] {
      return this.all().filter((e) => e.kind === "lesson" && e.stage === stage).map((e) => e.text);
    },
  };
}

// ── Artifacts (deliverables produced per stage) ──────────────────────────────
export function writeArtifact(id: string, name: string, content: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._/-]/g, "_");
  const f = resolve(ideaDir(id), "artifacts", safe);
  ensure(f);
  writeFileSync(f, content);
  return f;
}
export function listArtifacts(id: string): string[] {
  const dir = resolve(ideaDir(id), "artifacts");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string, prefix = "") => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(resolve(d, e.name), prefix + e.name + "/");
      else out.push(prefix + e.name);
    }
  };
  walk(dir);
  return out;
}
export function ideaPath(id: string): string {
  return ideaDir(id);
}
