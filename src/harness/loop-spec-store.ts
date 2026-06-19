// src/harness/loop-spec-store.ts
// Persistence for the codified loop spec — the system's PROCEDURAL MEMORY.
// The spec lives on disk as versioned JSON so the meta-loop can rewrite stages,
// checklists, and gates WITHOUT code changes. Every saved version is archived so
// a bad meta-loop change can be rolled back (DGM-style stepping-stone archive).
//
// Layout:
//   memory/loop/spec.json                  ← the active spec
//   memory/loop/archive/spec-v<N>.json     ← every historical version (immutable)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { LoopSpec, VersionedStage } from "../lib/loop-schema.js";
import { seedSpec } from "../lib/loop-seed.js";
import { log } from "../lib/log.js";

const SPEC_PATH = () => resolve(process.cwd(), "memory/loop/spec.json");
const ARCHIVE_DIR = () => resolve(process.cwd(), "memory/loop/archive");

function ensure(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}

/** Load the active spec, seeding it from code on first use. */
export function loadSpec(): LoopSpec {
  const p = SPEC_PATH();
  if (!existsSync(p)) {
    const seed = seedSpec();
    ensure(p);
    writeFileSync(p, JSON.stringify(seed, null, 2));
    archive(seed);
    log.ok("loop-spec", `Seeded codified loop spec v${seed.specVersion} (${seed.stages.length} stages) to disk.`);
    return seed;
  }
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    log.warn("loop-spec", `Spec unreadable (${(e as Error).message}); reseeding.`);
    const seed = seedSpec();
    writeFileSync(p, JSON.stringify(seed, null, 2));
    return seed;
  }
}

/** Persist a (presumably edited) spec and archive the new version. Always bumps
 *  from the current MAX known version so rollbacks/edits never collide. */
export function saveSpec(spec: LoopSpec, changeNote: string): LoopSpec {
  const maxKnown = Math.max(spec.specVersion, ...listSpecVersions(), 0);
  const next: LoopSpec = {
    ...spec,
    specVersion: maxKnown + 1,
    updatedAt: new Date().toISOString(),
    changeNote,
    stages: [...spec.stages].sort((a, b) => a.order - b.order),
  };
  const p = SPEC_PATH();
  ensure(p);
  writeFileSync(p, JSON.stringify(next, null, 2));
  archive(next);
  log.ok("loop-spec", `Saved loop spec v${next.specVersion}: ${changeNote}`);
  return next;
}

function archive(spec: LoopSpec) {
  const f = resolve(ARCHIVE_DIR(), `spec-v${spec.specVersion}.json`);
  ensure(f);
  if (!existsSync(f)) writeFileSync(f, JSON.stringify(spec, null, 2));
}

/** List archived spec versions (newest first). */
export function listSpecVersions(): number[] {
  const dir = ARCHIVE_DIR();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => f.match(/^spec-v(\d+)\.json$/)?.[1])
    .filter((x): x is string => !!x)
    .map(Number)
    .sort((a, b) => b - a);
}

/** Restore a prior archived spec version as the active spec (rollback). */
export function rollbackSpec(version: number): LoopSpec | null {
  const f = resolve(ARCHIVE_DIR(), `spec-v${version}.json`);
  if (!existsSync(f)) {
    log.error("loop-spec", `No archived spec v${version}.`);
    return null;
  }
  const restored: LoopSpec = JSON.parse(readFileSync(f, "utf8"));
  // Re-save as a NEW version so history is append-only and traceable.
  return saveSpec(restored, `Rolled back to spec v${version}.`);
}

/** Convenience: fetch a stage by id from the active spec. */
export function getStage(spec: LoopSpec, id: string): VersionedStage | undefined {
  return spec.stages.find((s) => s.id === id);
}

/** Validate structural integrity of a spec (used before accepting meta-loop edits). */
export function validateSpec(spec: LoopSpec): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const s of spec.stages) {
    if (ids.has(s.id)) problems.push(`duplicate stage id: ${s.id}`);
    ids.add(s.id);
    if (!s.title) problems.push(`stage ${s.id} missing title`);
    if (!s.checklist?.length) problems.push(`stage ${s.id} has no checklist items`);
    if (!s.gate?.predicate) problems.push(`stage ${s.id} has no gate predicate`);
  }
  // Dependencies must reference existing stages.
  for (const s of spec.stages) {
    for (const d of s.dependencies) if (!ids.has(d)) problems.push(`stage ${s.id} depends on unknown stage ${d}`);
    if (s.gate?.pivot?.toStage && !ids.has(s.gate.pivot.toStage)) problems.push(`stage ${s.id} pivots to unknown stage ${s.gate.pivot.toStage}`);
  }
  return { ok: problems.length === 0, problems };
}
