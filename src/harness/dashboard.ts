// src/harness/dashboard.ts
// A live terminal dashboard. Reads memory/status.json every second and redraws
// in place (ANSI), so you can watch the research fan-out, per-facet progress,
// spend, and streaming search activity. Decoupled from the engine: run it in a
// second terminal while a venture/research run is going, or after — attach and
// detach freely without touching the run.

import { status, type EngineStatus, type FacetState } from "./status.js";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function icon(state: FacetState, frame: number): string {
  switch (state) {
    case "done": return `${C.green}✓${C.reset}`;
    case "failed": return `${C.red}✗${C.reset}`;
    case "researching": return `${C.yellow}${SPIN[frame % SPIN.length]}${C.reset}`;
    default: return `${C.gray}·${C.reset}`;
  }
}

function fmtElapsed(fromIso: string): string {
  const ms = Date.now() - new Date(fromIso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

function frame(s: EngineStatus, tick: number): string {
  const lines: string[] = [];
  const W = 64;
  lines.push(`${C.bold}${C.cyan}┌─ Agent Forge ${"─".repeat(Math.max(0, W - 14))}┐${C.reset}`);
  const stale = Date.now() - new Date(s.updatedAt).getTime() > 90_000;
  const phaseLabel = `${C.bold}${s.phase}${C.reset}`;
  lines.push(`  phase: ${phaseLabel}   elapsed: ${fmtElapsed(s.startedAt)}   spend: ~$${s.spendUsd.toFixed(2)}`);
  if (s.note) lines.push(`  ${C.dim}${s.note.slice(0, W - 4)}${C.reset}`);
  lines.push("");

  // Fan-out tree (research) — or a generic working indicator for other phases.
  if (s.facets.length) {
    const done = s.facets.filter((f) => f.state === "done").length;
    lines.push(`  ${C.bold}Research fan-out${C.reset} ${C.dim}(${done}/${s.facets.length} facets done)${C.reset}`);
    s.facets.forEach((f, i) => {
      const branch = i === s.facets.length - 1 ? "└─" : "├─";
      const meta =
        f.state === "researching"
          ? `${C.dim}${f.searches ?? 0} searches · ${f.startedAt ? fmtElapsed(f.startedAt) : ""}${C.reset}`
          : f.state === "done"
            ? `${C.dim}${f.claims ?? 0} claims${C.reset}`
            : f.state === "failed"
              ? `${C.red}failed${C.reset}`
              : `${C.dim}queued${C.reset}`;
      lines.push(`    ${branch} ${icon(f.state, tick)} ${f.title.slice(0, 34).padEnd(34)} ${meta}`);
    });
  } else {
    const spin = stale ? `${C.red}■${C.reset}` : `${C.yellow}${SPIN[tick % SPIN.length]}${C.reset}`;
    lines.push(`  ${C.bold}Working${C.reset}  ${spin} ${C.dim}${s.note || "…"}${C.reset}`);
  }
  lines.push("");

  // Recent activity
  lines.push(`  ${C.bold}Activity${C.reset} ${stale ? `${C.red}(no update >90s — may be paused/done)${C.reset}` : ""}`);
  const recent = s.activity.slice(-8);
  if (!recent.length) lines.push(`    ${C.dim}(waiting for tool activity…)${C.reset}`);
  for (const a of recent) lines.push(`    ${C.dim}${a.slice(0, W - 4)}${C.reset}`);

  lines.push(`${C.bold}${C.cyan}└${"─".repeat(W)}┘${C.reset}`);
  lines.push(`${C.dim}  reading ${status.path()} · Ctrl-C to exit · engine keeps running${C.reset}`);
  return lines.join("\n");
}

export async function runDashboard(): Promise<void> {
  let tick = 0;
  const draw = () => {
    const s = status.snapshot();
    // clear screen + home
    process.stdout.write("\x1b[2J\x1b[H");
    process.stdout.write(frame(s, tick));
    tick++;
  };
  draw();
  const timer = setInterval(draw, 1000);
  // Keep process alive until Ctrl-C.
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      clearInterval(timer);
      process.stdout.write("\n");
      resolve();
    });
  });
}

// Exported for snapshot testing.
export const _test = { frame };
