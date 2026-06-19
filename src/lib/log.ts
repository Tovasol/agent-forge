// src/lib/log.ts
// Minimal structured console logger with phase tags and colors.

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

export const log = {
  info(tag: string, msg: string) {
    console.log(`${C.dim}${stamp()}${C.reset} ${C.cyan}[${tag}]${C.reset} ${msg}`);
  },
  step(tag: string, msg: string) {
    console.log(`${C.dim}${stamp()}${C.reset} ${C.blue}[${tag}]${C.reset} ${msg}`);
  },
  ok(tag: string, msg: string) {
    console.log(`${C.dim}${stamp()}${C.reset} ${C.green}[${tag}]${C.reset} ${msg}`);
  },
  warn(tag: string, msg: string) {
    console.log(`${C.dim}${stamp()}${C.reset} ${C.yellow}[${tag}]${C.reset} ${msg}`);
  },
  error(tag: string, msg: string) {
    console.log(`${C.dim}${stamp()}${C.reset} ${C.red}[${tag}]${C.reset} ${msg}`);
  },
  gate(msg: string) {
    console.log(`\n${C.magenta}━━━ HUMAN GATE ━━━${C.reset}\n${msg}\n`);
  },
  raw(msg: string) {
    console.log(msg);
  },
};
