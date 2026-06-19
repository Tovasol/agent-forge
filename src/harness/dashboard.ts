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

/** Word-wrap PLAIN text to a width (handles over-long single tokens like URLs). */
function wrapPlain(text: string, width: number): string[] {
  if (width < 8) width = 8;
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let cur = "";
    const push = () => { if (cur) { out.push(cur); cur = ""; } };
    for (let w of words) {
      // hard-split a token longer than the width (e.g. a long URL)
      while (w.length > width) {
        push();
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= width) cur += " " + w;
      else { push(); cur = w; }
    }
    push();
    if (!words.length) out.push("");
  }
  return out;
}

function frame(s: EngineStatus, tick: number, cols: number, rows: number): string {
  const term = Math.max(30, Math.min(cols, 200));
  const W = term - 2; // inner width between the border chars
  const indent = 4;
  const wrapW = W - indent;
  const lines: string[] = [];

  lines.push(`${C.bold}${C.cyan}┌─ Agent Forge ${"─".repeat(Math.max(0, W - 14))}┐${C.reset}`);
  const stale = Date.now() - new Date(s.updatedAt).getTime() > 90_000;
  const headerLine = `phase: ${s.phase}   elapsed: ${fmtElapsed(s.startedAt)}   spend: ~$${s.spendUsd.toFixed(2)}`;
  for (const l of wrapPlain(headerLine, W - 2)) lines.push(`  ${l}`);
  if (s.note) for (const l of wrapPlain(s.note, W - 2)) lines.push(`  ${C.dim}${l}${C.reset}`);
  lines.push("");

  // Fan-out tree (research) — or a generic working indicator for other phases.
  if (s.facets.length) {
    const done = s.facets.filter((f) => f.state === "done").length;
    lines.push(`  ${C.bold}Research fan-out${C.reset} ${C.dim}(${done}/${s.facets.length} facets done)${C.reset}`);
    const titleW = Math.max(16, Math.min(40, W - 24));
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
      lines.push(`    ${branch} ${icon(f.state, tick)} ${f.title.slice(0, titleW).padEnd(titleW)} ${meta}`);
    });
  } else {
    const spin = stale ? `${C.red}■${C.reset}` : `${C.yellow}${SPIN[tick % SPIN.length]}${C.reset}`;
    lines.push(`  ${C.bold}Working${C.reset}  ${spin}`);
  }
  lines.push("");

  // Recent activity — WRAP long lines to terminal width, bounded by screen height.
  lines.push(`  ${C.bold}Activity${C.reset} ${stale ? `${C.red}(no update >90s — may be paused/done)${C.reset}` : ""}`);
  // Budget remaining vertical space for activity so the frame fits the screen.
  const reserved = lines.length + 2; // current lines + border + footer
  const activityBudget = Math.max(3, (rows || 24) - reserved);
  const wrapped: string[] = [];
  // -2 headroom: emoji/CJK render ~2 columns but count as 1 code point.
  for (const a of s.activity) for (const l of wrapPlain(a, Math.max(8, wrapW - 2))) wrapped.push(l);
  const shown = wrapped.slice(-activityBudget);
  if (!shown.length) lines.push(`    ${C.dim}(waiting for activity…)${C.reset}`);
  for (const l of shown) lines.push(`    ${C.dim}${l}${C.reset}`);

  lines.push(`${C.bold}${C.cyan}└${"─".repeat(W)}┘${C.reset}`);
  for (const l of wrapPlain("tail -f memory/logs/latest.log for full log · Ctrl-C to exit", term - 2))
    lines.push(`${C.dim}  ${l}${C.reset}`);
  return lines.join("\n");
}

export async function runDashboard(): Promise<void> {
  let tick = 0;
  const draw = () => {
    const s = status.snapshot();
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    process.stdout.write("\x1b[2J\x1b[H"); // clear + home
    process.stdout.write(frame(s, tick, cols, rows));
    tick++;
  };
  draw();
  const timer = setInterval(draw, 1000);
  // Redraw immediately on terminal resize so it always fills the window.
  process.stdout.on("resize", draw);
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      clearInterval(timer);
      process.stdout.off("resize", draw);
      process.stdout.write("\n");
      resolve();
    });
  });
}

// Exported for snapshot testing.
export const _test = { frame, wrapPlain };
