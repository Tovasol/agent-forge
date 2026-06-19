// src/harness/backlog.ts
// Durable backlog + approval-queue + attribution store for the growth module.
// Everything is JSON on disk under memory/growth/ so the loop is restartable
// and the operator can inspect/edit by hand.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import type {
  BacklogTask,
  ApprovalItem,
  AttributionRow,
} from "../lib/growth-types.js";

const ROOT = resolve(process.cwd());
const GROWTH = resolve(ROOT, "memory/growth");
const BACKLOG = resolve(GROWTH, "backlog.json");
const APPROVALS = resolve(GROWTH, "approvals.json");
const ATTRIBUTION = resolve(GROWTH, "attribution.json");
const ARTIFACTS = resolve(GROWTH, "artifacts");

function ensure(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}
function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(path: string, data: unknown) {
  ensure(path);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ── Backlog ──────────────────────────────────────────────────────────────────
export function loadBacklog(): BacklogTask[] {
  return readJson<BacklogTask[]>(BACKLOG, []);
}
export function saveBacklog(tasks: BacklogTask[]) {
  writeJson(BACKLOG, tasks);
}
export function upsertTask(task: BacklogTask) {
  const all = loadBacklog();
  const i = all.findIndex((t) => t.id === task.id);
  task.updatedAt = new Date().toISOString();
  if (i >= 0) all[i] = task;
  else all.push(task);
  saveBacklog(all);
}
export function getTask(id: string): BacklogTask | undefined {
  return loadBacklog().find((t) => t.id === id);
}

// ── Approvals ────────────────────────────────────────────────────────────────
export function loadApprovals(): ApprovalItem[] {
  return readJson<ApprovalItem[]>(APPROVALS, []);
}
export function saveApprovals(items: ApprovalItem[]) {
  writeJson(APPROVALS, items);
}
export function enqueueApproval(item: ApprovalItem) {
  const all = loadApprovals();
  if (!all.find((a) => a.id === item.id)) all.push(item);
  saveApprovals(all);
}
export function pendingApprovals(): ApprovalItem[] {
  return loadApprovals().filter((a) => !a.decided);
}

// ── Attribution ──────────────────────────────────────────────────────────────
export function loadAttribution(): AttributionRow[] {
  return readJson<AttributionRow[]>(ATTRIBUTION, []);
}
export function saveAttribution(rows: AttributionRow[]) {
  writeJson(ATTRIBUTION, rows);
}

// ── Artifacts ────────────────────────────────────────────────────────────────
export function writeArtifact(name: string, content: string): string {
  ensureDir(ARTIFACTS);
  const path = resolve(ARTIFACTS, name);
  ensure(path);
  writeFileSync(path, content);
  return path.replace(ROOT + "/", "");
}
export function listArtifacts(): string[] {
  if (!existsSync(ARTIFACTS)) return [];
  return readdirSync(ARTIFACTS);
}
