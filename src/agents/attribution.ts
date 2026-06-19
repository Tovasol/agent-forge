// src/agents/attribution.ts
// Reads booked-call attribution (a simple CSV/JSON the operator maintains, or
// the "how did you hear about us?" answers exported from the CRM) and feeds it
// back into the backlog: channels that book calls get their confidence raised,
// channels producing nothing after real effort get lowered. This is what makes
// the agent shift effort toward what actually works.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "../lib/log.js";
import type { Channel, AttributionRow } from "../lib/growth-types.js";
import { loadBacklog, saveBacklog, saveAttribution } from "../harness/backlog.js";

const SOURCES_TO_CHANNEL: Record<string, Channel> = {
  blog: "content",
  seo: "content",
  google: "content",
  article: "content",
  linkedin: "linkedin",
  email: "coldemail",
  cold: "coldemail",
  reddit: "community",
  hn: "community",
  hackernews: "community",
  slack: "community",
  discord: "community",
  community: "community",
};

function classify(source: string): Channel | "unknown" {
  const s = source.toLowerCase();
  for (const key of Object.keys(SOURCES_TO_CHANNEL)) {
    if (s.includes(key)) return SOURCES_TO_CHANNEL[key];
  }
  return "unknown";
}

/**
 * Expects memory/growth/calls.csv with rows: source,calls
 * (e.g. "linkedin,3"  "blog post snowflake,2"  "cold email,1").
 * Falls back gracefully if absent.
 */
export function runAttribution(): void {
  const path = resolve(process.cwd(), "memory/growth/calls.csv");
  if (!existsSync(path)) {
    log.warn(
      "attribution",
      "No memory/growth/calls.csv yet. Add rows like `linkedin,3` (source,booked-calls) and re-run to steer the agent."
    );
    return;
  }

  const rows: AttributionRow[] = [];
  const counts: Partial<Record<Channel | "unknown", number>> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const [source, callsStr] = line.split(",");
    if (!source || !callsStr) continue;
    const calls = parseInt(callsStr.trim(), 10);
    if (!Number.isFinite(calls)) continue;
    const channel = classify(source.trim());
    counts[channel] = (counts[channel] ?? 0) + calls;
    rows.push({ source: source.trim(), channel, calls, updatedAt: new Date().toISOString() });
  }
  saveAttribution(rows);

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) || 1;
  log.raw("\nBooked calls by channel:");
  for (const [ch, n] of Object.entries(counts)) {
    log.raw(`  ${ch.padEnd(12)} ${n}  (${Math.round((100 * (n ?? 0)) / total)}%)`);
  }

  // Reweight backlog confidence by each channel's share of booked calls.
  const backlog = loadBacklog();
  for (const t of backlog) {
    const share = (counts[t.channel] ?? 0) / total;
    // Nudge confidence toward observed performance (bounded 0.2..0.95).
    const target = 0.3 + 0.65 * share;
    t.confidence = Math.max(0.2, Math.min(0.95, 0.7 * t.confidence + 0.3 * target));
    t.creditedCalls = counts[t.channel] ?? 0;
  }
  saveBacklog(backlog);
  log.ok("attribution", "Backlog confidence reweighted toward channels that book calls.");
}
