// src/harness/scorer.ts
// Turns a backlog into a prioritized queue. Scores every task by RICE
// (Reach × Impact × Confidence ÷ Effort) toward the goal of QUALIFIED CALLS
// BOOKED, applies a recency penalty so recurring work rotates (the agent is
// never idle and never hammers one task), and surfaces the best ACTIONABLE
// next task — i.e. one the agent can make progress on right now.

import type { BacklogTask, ScoredTask, Channel } from "../lib/growth-types.js";

const DAY = 24 * 60 * 60 * 1000;

export function rice(t: BacklogTask): number {
  const effort = Math.max(0.5, t.effort);
  return (t.reach * t.impact * t.confidence) / effort;
}

export function ice(t: BacklogTask): number {
  // ICE uses ease (inverse of effort, normalized to ~1..10).
  const ease = Math.max(1, 10 - Math.min(9, t.effort));
  return t.impact * t.confidence * ease;
}

function recencyPenalty(t: BacklogTask): number {
  if (!t.lastRunAt) return 1; // never run -> full priority
  const ageDays = (Date.now() - new Date(t.lastRunAt).getTime()) / DAY;
  // Recurring tasks regain priority as they age toward their cadence.
  const cadence =
    t.recurrence === "daily" ? 1 : t.recurrence === "weekly" ? 7 : t.recurrence === "monthly" ? 30 : Infinity;
  if (cadence === Infinity) return 0.15; // one-off already run -> low
  return Math.min(1, ageDays / cadence);
}

/** A task is actionable if there's real progress to make now. */
export function isActionable(t: BacklogTask): boolean {
  if (t.status === "blocked" || t.status === "done" || t.status === "skipped")
    return false;
  if (t.status === "awaiting-approval") return false; // parked on a human
  if (t.recurrence && (t.recurrence === "once") && t.status === "prepared")
    return false;
  return true;
}

export function score(tasks: BacklogTask[]): ScoredTask[] {
  return tasks
    .map((task) => {
      const r = rice(task);
      const priority = r * recencyPenalty(task);
      return { task, rice: r, ice: ice(task), priority };
    })
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Select the next task to work. Prefers the highest-priority ACTIONABLE task.
 * If the top task is gated and already prepared/awaiting approval, the planner
 * skips past it to the next actionable item — this is what keeps the agent
 * working instead of busy-spinning on a human gate.
 */
export function selectNext(tasks: BacklogTask[]): ScoredTask | null {
  const scored = score(tasks);
  for (const s of scored) {
    if (isActionable(s.task)) return s;
  }
  return null;
}

/** Group scored tasks by channel for reporting. */
export function byChannel(scored: ScoredTask[]): Record<Channel, ScoredTask[]> {
  const out = {} as Record<Channel, ScoredTask[]>;
  for (const s of scored) {
    (out[s.task.channel] ??= []).push(s);
  }
  return out;
}
