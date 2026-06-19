// src/lib/log.ts
// Structured console logger with phase tags + colors, now with a PERSISTENT
// disk sink (so every run leaves a record you can tail -f) and an `activity`
// channel for high-frequency streaming lines (e.g. each web search a worker
// runs), which fills the long silent gaps while a worker is researching.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

// Disk sink
const LOG_DIR = resolve(process.cwd(), "memory/logs");
const LATEST = resolve(LOG_DIR, "latest.log");
const RUN_FILE = resolve(LOG_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
let diskReady = false;
function ensureDisk() {
  if (diskReady) return;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(LATEST, `# run started ${new Date().toISOString()}\n`);
    diskReady = true;
  } catch {
    /* best-effort */
  }
}
function toDisk(line: string) {
  ensureDisk();
  if (!diskReady) return;
  const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
  try {
    appendFileSync(LATEST, plain + "\n");
    appendFileSync(RUN_FILE, plain + "\n");
  } catch {
    /* ignore */
  }
}

function emit(line: string) {
  console.log(line);
  toDisk(line);
}

export const log = {
  info(tag: string, msg: string) {
    emit(`${C.dim}${stamp()}${C.reset} ${C.cyan}[${tag}]${C.reset} ${msg}`);
  },
  step(tag: string, msg: string) {
    emit(`${C.dim}${stamp()}${C.reset} ${C.blue}[${tag}]${C.reset} ${msg}`);
  },
  ok(tag: string, msg: string) {
    emit(`${C.dim}${stamp()}${C.reset} ${C.green}[${tag}]${C.reset} ${msg}`);
  },
  warn(tag: string, msg: string) {
    emit(`${C.dim}${stamp()}${C.reset} ${C.yellow}[${tag}]${C.reset} ${msg}`);
  },
  error(tag: string, msg: string) {
    emit(`${C.dim}${stamp()}${C.reset} ${C.red}[${tag}]${C.reset} ${msg}`);
  },
  gate(msg: string) {
    emit(`\n${C.magenta}━━━ HUMAN GATE ━━━${C.reset}\n${msg}\n`);
  },
  raw(msg: string) {
    emit(msg);
  },
  activity(tag: string, msg: string) {
    emit(`${C.dim}${stamp()}   ↳ [${tag}] ${msg}${C.reset}`);
  },
  logPaths() {
    return { latest: LATEST, run: RUN_FILE };
  },
};
