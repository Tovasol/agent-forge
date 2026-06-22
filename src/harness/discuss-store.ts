// src/harness/discuss-store.ts
// Two-tier memory for topic-scoped discussions — the storage half of the new
// `discuss2` command. The point is COST: instead of one ever-growing transcript
// per stage (re-sent every turn, quadratic), each decision gets its own bounded
// topic log, and only a small "conclusions" file is auto-loaded into future
// sessions.
//
//   COLD  — per-SESSION full transcript, append-only, never auto-loaded:
//             memory/loop/ideas/<id>/discussions/<session-id>.log.jsonl
//   HOT   — the distilled decisions, the ONLY thing future sessions read:
//             memory/loop/ideas/<id>/discussions/conclusions.json
//
// A "session" is named by a machine ID assigned at START (a timestamp-based
// stamp), NOT by topic. Conversations drift — you rarely know the real topic
// when you open one — so the human topic LABEL is inferred and confirmed only at
// /conclude time. Until then the session is findable by its id + a first-line
// preview. The conclusion's `slug` (derived from the confirmed label) is what
// keys the hot file; the cold log keeps its session-id filename.
//
// A conclusion is "sufficient, not lossless": the decision + the 2-4 load-bearing
// reasons (the ones that, if wrong, would flip the call) + alternatives rejected
// + constraints introduced + a POINTER back to the cold log. Nothing is truly
// lost — the full discussion is one file-read away when you want to re-assess.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { ideaPath } from "./loop-memory.js";

// ── Paths ────────────────────────────────────────────────────────────────────
function discussionsDir(ideaId: string): string {
  return resolve(ideaPath(ideaId), "discussions");
}
function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

/** The cold-log filename for a session/topic id (a session id OR a topic slug). */
export function topicLogName(id: string): string {
  return `${id}.log.jsonl`;
}
function logPath(ideaId: string, id: string): string {
  return resolve(discussionsDir(ideaId), topicLogName(id));
}
function conclusionsPath(ideaId: string): string {
  return resolve(discussionsDir(ideaId), "conclusions.json");
}

/**
 * Mint a fresh machine session id at the START of a discussion, before any
 * topic is known. Sortable (timestamp prefix) + a short random suffix so two
 * sessions opened in the same millisecond don't collide. e.g. "s-lq3k8z-4f9a".
 */
export function newSessionId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `s-${stamp}-${rand}`;
}

/** True if an id looks like a machine session id (vs a human topic slug). */
export function isSessionId(id: string): boolean {
  return /^s-[0-9a-z]+-[0-9a-z]+$/.test(id);
}

/** Stable slug for a topic title, used as the conclusion key. */
export function slugifyTopic(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "topic"
  );
}

// ── Cold tier: per-topic transcript (append-only) ────────────────────────────
export interface DiscussTurn {
  at: string;
  role: "operator" | "framework";
  text: string;
}

/** Append one turn to a session's cold log (id = session id or topic slug). */
export function appendTurn(ideaId: string, id: string, turn: Omit<DiscussTurn, "at">): void {
  const dir = discussionsDir(ideaId);
  ensureDir(dir);
  const e: DiscussTurn = { at: new Date().toISOString(), ...turn };
  appendFileSync(logPath(ideaId, id), JSON.stringify(e) + "\n");
}

/** Read a session's full cold transcript (for resume, or for re-assessment). */
export function readTurns(ideaId: string, id: string): DiscussTurn[] {
  const f = logPath(ideaId, id);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as DiscussTurn);
}

/** List every cold-log id by scanning the discussions dir for *.log.jsonl. */
export function listTopics(ideaId: string): string[] {
  const dir = discussionsDir(ideaId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".log.jsonl"))
    .map((n) => n.replace(/\.log\.jsonl$/, ""));
}

/** A resumable session: its log id, size, first-line preview, last activity. */
export interface SessionSummary {
  id: string;
  isSession: boolean; // true = machine id (no topic yet); false = legacy slug
  turnCount: number;
  preview: string; // first operator line, trimmed — what the session is "about"
  lastAt: string; // timestamp of the last turn (for sorting/recency)
}

/** First operator line of a log, as a short preview of what it's about. */
function firstOperatorLine(turns: DiscussTurn[]): string {
  const first = turns.find((t) => t.role === "operator") ?? turns[0];
  if (!first) return "(empty)";
  const oneLine = first.text.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? oneLine.slice(0, 77) + "…" : oneLine;
}

/**
 * List sessions that have NOT yet been concluded — the ones you'd want to
 * resume. Each carries an id + first-line preview so you can pick by content,
 * not by remembering a slug. Sorted most-recent-first.
 */
export function listUnconcludedSessions(ideaId: string): SessionSummary[] {
  const concludedSlugs = new Set(
    loadConclusions(ideaId)
      .filter((c) => c.status === "concluded")
      .map((c) => c.slug)
  );
  const out: SessionSummary[] = [];
  for (const id of listTopics(ideaId)) {
    if (concludedSlugs.has(id)) continue; // legacy slug-named log already concluded
    const turns = readTurns(ideaId, id);
    if (!turns.length) continue;
    out.push({
      id,
      isSession: isSessionId(id),
      turnCount: turns.length,
      preview: firstOperatorLine(turns),
      lastAt: turns[turns.length - 1]?.at ?? "",
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

// ── Hot tier: distilled conclusions (the only auto-loaded file) ──────────────
export interface Conclusion {
  id: string;
  topic: string; // human title (inferred + confirmed at conclude time)
  slug: string; // topic key (slug of the confirmed title) for the hot file
  session?: string; // machine session id the cold log lives under (if any)
  stage: string; // stage in focus when concluded
  status: "open" | "concluded" | "superseded";
  decision: string; // one-line decision reached
  reasons: string[]; // 2-4 load-bearing reasons (flip the call if wrong)
  rejected: string[]; // alternatives considered and why not
  constraints: string[]; // binding constraints this introduced
  log: string; // pointer back to the cold transcript filename
  concludedAt: string;
  turnCount: number; // fingerprint: how big the discussion was
  factUpdates?: Record<string, unknown>;
  rerunStage?: string;
  supersedes?: string; // id of an earlier conclusion this replaces
}

export function loadConclusions(ideaId: string): Conclusion[] {
  const f = conclusionsPath(ideaId);
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf8")) as Conclusion[];
  } catch {
    return [];
  }
}

function saveConclusions(ideaId: string, all: Conclusion[]): void {
  const dir = discussionsDir(ideaId);
  ensureDir(dir);
  writeFileSync(conclusionsPath(ideaId), JSON.stringify(all, null, 2));
}

/** Append a concluded decision. If it supersedes an earlier one (same slug,
 *  status concluded), the prior is marked "superseded" but kept for history. */
export function recordConclusion(ideaId: string, c: Conclusion): void {
  const all = loadConclusions(ideaId);
  if (c.supersedes) {
    const prior = all.find((x) => x.id === c.supersedes);
    if (prior) prior.status = "superseded";
  } else {
    // auto-supersede the latest concluded one for the same topic slug
    const prior = all
      .filter((x) => x.slug === c.slug && x.status === "concluded")
      .sort((a, b) => b.concludedAt.localeCompare(a.concludedAt))[0];
    if (prior) {
      prior.status = "superseded";
      c.supersedes = prior.id;
    }
  }
  all.push(c);
  saveConclusions(ideaId, all);
}

/** The hot context block injected into every new discussion and (later) into
 *  stage runs: only ACTIVE concluded decisions, rendered compactly. */
export function conclusionsContext(ideaId: string): string {
  const active = loadConclusions(ideaId).filter((c) => c.status === "concluded");
  if (!active.length) return "(no concluded decisions yet)";
  return active
    .map((c) => {
      const lines = [`• [${c.slug}] ${c.decision}`];
      if (c.constraints.length) lines.push(`    constraints: ${c.constraints.join("; ")}`);
      if (c.reasons.length) lines.push(`    because: ${c.reasons.join("; ")}`);
      return lines.join("\n");
    })
    .join("\n");
}

/** Fetch one conclusion + its full cold transcript, for re-assessment. */
export function reopenConclusion(
  ideaId: string,
  slug: string
): { conclusion: Conclusion | null; turns: DiscussTurn[] } {
  const conclusion =
    loadConclusions(ideaId)
      .filter((c) => c.slug === slug)
      .sort((a, b) => b.concludedAt.localeCompare(a.concludedAt))[0] ?? null;
  // The cold log lives under the session id when present, else under the slug
  // (legacy slug-named logs). Strip the ".log.jsonl" suffix off the pointer.
  const logId =
    conclusion?.session ??
    conclusion?.log?.replace(/\.log\.jsonl$/, "") ??
    slug;
  return { conclusion, turns: readTurns(ideaId, logId) };
}
