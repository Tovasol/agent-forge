// src/harness/snapshot.ts
// Lightweight git snapshots so autonomous runs (especially overnight) can't
// destroy good work irreversibly. Commits the durable artifacts (site/scaffold
// + the valuable parts of memory) at major milestones, and offers rollback.
//
// SAFETY FIRST:
//   - NEVER commits secrets. We guarantee .env (and friends) are ignored before
//     the first `git add`. If a .gitignore exists without .env, we append a
//     protective block rather than trust it.
//   - Uses a local committer identity so it works without global git config.
//   - Degrades gracefully: if git is missing or a step fails, it logs and
//     continues — snapshots are a safety net, never a hard dependency.
//   - LOCAL only. It does not push to a remote unless FORGE_GIT_PUSH is set.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "../lib/log.js";

const ROOT = () => process.cwd();
const lastGoodPath = () => resolve(ROOT(), "memory/snapshots/last-good.txt");

const IDENTITY = ["-c", "user.name=Agent Forge", "-c", "user.email=forge@local"];

// Paths worth versioning for rollback (durable progress, never secrets).
const TRACKED = ["site/scaffold", "memory", "prompts", "skills", "docs"];

// Lines we MUST have ignored before committing — protects secrets + skips noise.
const REQUIRED_IGNORES = [
  ".env",
  ".env.*",
  "!.env.example",
  "node_modules/",
  "**/node_modules/",
  "dist/",
  "site/scaffold/node_modules/",
  ".wrangler/",
  "memory/logs/",
  "memory/status.json",
  "memory/steer/",
  "*.log",
];

function git(args: string[], opts: { allowFail?: boolean } = {}): string | null {
  try {
    return execFileSync("git", [...IDENTITY, ...args], { cwd: ROOT(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (!opts.allowFail) log.warn("snapshot", `git ${args[0]} failed: ${(e as Error).message.split("\n")[0]}`);
    return null;
  }
}

export function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isRepo(): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT(), stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Guarantee .env (and friends) are ignored. Returns false if we can't ensure it. */
function ensureSecretsIgnored(): boolean {
  const path = resolve(ROOT(), ".gitignore");
  let current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = current.split("\n").map((l) => l.trim());
  const missing = REQUIRED_IGNORES.filter((req) => !lines.includes(req));
  if (missing.length) {
    const block = `\n# ── Agent Forge safety (auto-added): protect secrets, skip noise ──\n${missing.join("\n")}\n`;
    if (current) appendFileSync(path, block);
    else writeFileSync(path, block.trimStart());
  }
  // Hard assert: .env must now be ignored.
  const check = git(["check-ignore", ".env"], { allowFail: true });
  if (check === null) {
    // check-ignore returns non-zero (our wrapper -> null) when NOT ignored.
    // Re-read to be sure .env is present as a rule.
    const after = readFileSync(path, "utf8");
    if (!/^\.env\s*$/m.test(after)) {
      log.error("snapshot", "Refusing to snapshot: could not guarantee .env is git-ignored. No commit made.");
      return false;
    }
  }
  return true;
}

/** Initialize a repo if needed, protect secrets, and make a baseline commit. */
export function ensureRepo(): boolean {
  if (!gitAvailable()) {
    log.warn("snapshot", "git not found — snapshots disabled. Install git to enable rollback safety.");
    return false;
  }
  if (!isRepo()) {
    log.info("snapshot", "Initializing a local git repo for rollback safety…");
    if (git(["init"]) === null) return false;
  }
  if (!ensureSecretsIgnored()) return false;
  return true;
}

/**
 * Commit the current durable state. `markGood` records this as a known-good
 * restore point. Returns the short commit hash, or null if nothing changed /
 * snapshots unavailable.
 */
export function snapshot(label: string, opts: { markGood?: boolean } = {}): string | null {
  if (!ensureRepo()) return null;

  // Stage only tracked, existing paths (respecting .gitignore).
  const present = TRACKED.filter((p) => existsSync(resolve(ROOT(), p)));
  if (present.length) git(["add", "--", ...present], { allowFail: true });

  // Nothing staged? Don't make an empty commit.
  const staged = git(["diff", "--cached", "--name-only"], { allowFail: true });
  if (!staged) return null;

  const msg = `forge: ${label} — ${new Date().toISOString()}`;
  if (git(["commit", "-m", msg], { allowFail: true }) === null) return null;
  const hash = git(["rev-parse", "--short", "HEAD"], { allowFail: true });

  if (hash && opts.markGood) {
    try {
      mkdirSync(resolve(ROOT(), "memory/snapshots"), { recursive: true });
      writeFileSync(lastGoodPath(), hash + "\n");
    } catch {
      /* best effort */
    }
  }
  if (hash) {
    log.ok("snapshot", `📸 ${opts.markGood ? "good " : ""}snapshot ${hash}: ${label}`);
    maybePush();
  }
  return hash;
}

function maybePush() {
  if ((process.env.FORGE_GIT_PUSH ?? "").toLowerCase().match(/^(1|true|yes|on)$/)) {
    const out = git(["push"], { allowFail: true });
    if (out !== null) log.ok("snapshot", "Pushed snapshot to remote.");
    else log.warn("snapshot", "FORGE_GIT_PUSH set but push failed (no remote / auth?). Snapshot is still saved locally.");
  }
}

export function lastGood(): string | null {
  if (existsSync(lastGoodPath())) return readFileSync(lastGoodPath(), "utf8").trim() || null;
  return null;
}

export interface SnapInfo {
  hash: string;
  subject: string;
  when: string;
}

export function listSnapshots(n = 15): SnapInfo[] {
  if (!isRepo()) return [];
  const out = git(["log", `-n${n}`, "--grep=^forge:", "--pretty=%h\t%s\t%cr"], { allowFail: true });
  if (!out) return [];
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [hash, subject, when] = l.split("\t");
      return { hash, subject: (subject ?? "").replace(/^forge:\s*/, ""), when: when ?? "" };
    });
}

/**
 * Roll the durable files back to a snapshot. Non-destructive to history: we
 * first snapshot the CURRENT state (so you can go forward again), then restore
 * the tracked paths from the chosen commit into the working tree.
 */
export function rollback(ref?: string): boolean {
  if (!isRepo()) {
    log.error("snapshot", "No git repo yet — nothing to roll back to.");
    return false;
  }
  const target = ref || lastGood();
  if (!target) {
    log.error("snapshot", "No snapshot to roll back to. Run a pass first, or pass an explicit commit ref.");
    return false;
  }
  // Verify the ref exists.
  if (git(["cat-file", "-e", `${target}^{commit}`], { allowFail: true }) === null) {
    log.error("snapshot", `Unknown snapshot "${target}". Use \`npm run forge -- snapshots\` to list valid ones.`);
    return false;
  }

  // Safety: preserve current state before overwriting it.
  snapshot("pre-rollback safety snapshot");

  // Restore only tracked paths whose top-level dir exists in the target commit
  // (passing a nonexistent pathspec makes git checkout error out).
  const topLevel = new Set((git(["ls-tree", "--name-only", target], { allowFail: true }) ?? "").split("\n").filter(Boolean));
  const paths = TRACKED.filter((p) => topLevel.has(p.split("/")[0]));
  if (!paths.length) {
    log.error("snapshot", `Snapshot ${target} has none of the tracked paths. Nothing restored.`);
    return false;
  }
  const ok = git(["checkout", target, "--", ...paths], { allowFail: true });
  if (ok === null) {
    log.error("snapshot", "Rollback failed during checkout. Your current state is preserved in the safety snapshot.");
    return false;
  }
  // Record the restore as a commit so the working tree and history agree.
  snapshot(`rolled back to ${target}`);
  log.ok("snapshot", `Rolled back site + memory to ${target}. Review, then re-deploy when ready.`);
  return true;
}
