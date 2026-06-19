// src/harness/steering.ts
// A steering channel so the operator can guide the engine mid-run WITHOUT
// stopping it. Messages are written to a disk inbox by `forge tell "..."` (a
// separate process), and the engine drains + injects them into the next agent
// call. Two kinds:
//   - one-shot: applied to the next agent call, then archived.
//   - sticky:   standing guidance applied to every call until cleared.
//   - urgent:   one-shot + a flag that asks the engine to interrupt the
//               in-flight call and retry now (best-effort).

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const DIR = resolve(process.cwd(), "memory/steer");
const INBOX = resolve(DIR, "inbox.jsonl"); // pending one-shot messages
const STICKY = resolve(DIR, "sticky.md"); // standing instructions
const URGENT = resolve(DIR, "urgent.flag"); // presence => interrupt requested
const LOG = resolve(DIR, "log.jsonl"); // archive of consumed messages

interface SteerMsg {
  at: string;
  text: string;
}

function ensure(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}

/** Operator side: queue a steering message (called by `forge tell`). */
export function addSteering(text: string, opts: { sticky?: boolean; urgent?: boolean } = {}): void {
  ensure(INBOX);
  if (opts.sticky) {
    appendFileSync(STICKY, `- ${text}\n`);
    return;
  }
  appendFileSync(INBOX, JSON.stringify({ at: new Date().toISOString(), text } as SteerMsg) + "\n");
  if (opts.urgent) writeFileSync(URGENT, new Date().toISOString());
}

export function clearSticky(): void {
  if (existsSync(STICKY)) rmSync(STICKY);
}

export function stickyText(): string {
  return existsSync(STICKY) ? readFileSync(STICKY, "utf8").trim() : "";
}

export function pendingCount(): number {
  if (!existsSync(INBOX)) return 0;
  return readFileSync(INBOX, "utf8").split("\n").filter(Boolean).length;
}

export function hasUrgent(): boolean {
  return existsSync(URGENT);
}
export function clearUrgent(): void {
  if (existsSync(URGENT)) rmSync(URGENT);
}

/**
 * Engine side: drain pending one-shot messages (archiving them) and combine
 * with any sticky guidance. Returns "" when there's nothing to inject.
 */
export function drainSteering(): string {
  const parts: string[] = [];
  const sticky = stickyText();
  if (sticky) parts.push(`Standing guidance:\n${sticky}`);

  if (existsSync(INBOX)) {
    const lines = readFileSync(INBOX, "utf8").split("\n").filter(Boolean);
    if (lines.length) {
      const msgs = lines.map((l) => {
        try {
          return JSON.parse(l) as SteerMsg;
        } catch {
          return { at: "", text: l };
        }
      });
      parts.push("New operator message(s):\n" + msgs.map((m) => `- ${m.text}`).join("\n"));
      // archive + clear inbox
      ensure(LOG);
      for (const m of msgs) appendFileSync(LOG, JSON.stringify({ ...m, consumedAt: new Date().toISOString() }) + "\n");
      rmSync(INBOX);
    }
  }
  return parts.join("\n\n");
}
