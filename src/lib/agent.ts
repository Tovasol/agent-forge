// src/lib/agent.ts
// Thin wrapper around the Claude Agent SDK that:
//   1. Configures auth (subscription OAuth vs. pay-as-you-go API key).
//   2. Runs an agent with a system prompt, allowed tools, and optional MCP
//      research servers.
//   3. Collects the final text plus a rough usage tally.
//
// The SDK is loaded dynamically so the framework still type-checks and the CLI
// still runs (status/doctor) even before `npm install` pulls the SDK.

import type { ForgeConfig } from "./types.js";
import { log } from "./log.js";
import { status } from "../harness/status.js";
import { drainSteering, hasUrgent, clearUrgent } from "../harness/steering.js";
import { activeDirectivesText, listDirectives } from "../harness/directives.js";

function listDirectivesCount(): number {
  return listDirectives().length;
}

export interface RunOptions {
  systemPrompt: string;
  prompt: string;
  model: string;
  cfg: ForgeConfig;
  /** Built-in tools to allow, e.g. ["WebSearch","WebFetch","Read","Write","Bash","Glob","Grep"]. */
  allowedTools?: string[];
  /** Permission mode for this run. "plan" = read-only planning. */
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  /** Working directory the agent is allowed to touch. */
  cwd?: string;
  maxTurns?: number;
  /** Live tool-activity callback (searches/fetches as the agent streams). */
  onActivity?: (a: { kind: string; detail: string }) => void;
  /** Short label for this step (e.g. "decide", "build", "stage:beachhead") so
   *  universal log/status/heartbeat feedback can attribute activity to it. */
  label?: string;
  /** One-line description of WHAT this step is doing, shown immediately so a
   *  tool-less reasoning phase isn't a blank spinner. */
  intent?: string;
}

export interface RunResult {
  text: string;
  turns: number;
  costUsd?: number;
  raw?: unknown;
}

/**
 * Configure process env for the chosen auth mode, then return a cleanup fn.
 */
function applyAuth(cfg: ForgeConfig): () => void {
  const prev = {
    key: process.env.ANTHROPIC_API_KEY,
  };
  if (cfg.auth === "apikey") {
    if (!cfg.apiKey) throw new Error("apikey auth selected but no ANTHROPIC_API_KEY");
    process.env.ANTHROPIC_API_KEY = cfg.apiKey;
  } else {
    // Subscription mode: ensure no stray API key overrides the OAuth session.
    delete process.env.ANTHROPIC_API_KEY;
  }
  return () => {
    if (prev.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev.key;
  };
}

/**
 * Build the MCP server map from whatever research keys are present.
 * Returns an object suitable for the SDK's `mcpServers` option.
 */
export function buildResearchMcpServers(cfg: ForgeConfig): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  if (cfg.research.firecrawlKey) {
    servers.firecrawl = {
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: { FIRECRAWL_API_KEY: cfg.research.firecrawlKey },
    };
  }
  if (cfg.research.exaKey) {
    servers.exa = {
      command: "npx",
      args: ["-y", "exa-mcp-server"],
      env: { EXA_API_KEY: cfg.research.exaKey },
    };
  }
  if (cfg.research.tavilyKey) {
    servers.tavily = {
      command: "npx",
      args: ["-y", "tavily-mcp"],
      env: { TAVILY_API_KEY: cfg.research.tavilyKey },
    };
  }
  return servers;
}

/**
 * Dynamically import the SDK. Throws a friendly error if it isn't installed.
 */
async function loadSdk(): Promise<any> {
  try {
    // @ts-ignore — resolved at runtime after `npm install`.
    return await import("@anthropic-ai/claude-agent-sdk");
  } catch {
    throw new Error(
      "The Claude Agent SDK isn't installed yet.\n" +
        "Run `npm install` first. If it persists, confirm the package name\n" +
        "`@anthropic-ai/claude-agent-sdk` and your Node version (>=18.17)."
    );
  }
}

/** Is this the SDK's transient subprocess-transport crash (exit code 1)? */
function isTransientTransportError(e: unknown): boolean {
  const msg = errText(e);
  return (
    /process exited with code 1/i.test(msg) ||
    /Claude Code process exited/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|overloaded|429|rate.?limit/i.test(msg)
  );
}

/** Full error text including any nested cause/stderr, for pattern matching. */
function errText(e: unknown): string {
  const err = e as any;
  return [err?.message, err?.stderr, err?.cause?.message, String(e)].filter(Boolean).join(" ");
}

/** Did we hit the subscription/plan USAGE limit (vs. a quick transient)? */
function isUsageLimitError(e: unknown): boolean {
  const msg = errText(e);
  return (
    /usage limit/i.test(msg) ||
    /usage cap/i.test(msg) ||
    /limit (?:will )?reset/i.test(msg) ||
    /reached your .*limit/i.test(msg) ||
    /quota (?:exceeded|reached)/i.test(msg) ||
    /plan limit/i.test(msg)
  );
}

/** Try to extract a reset time from a usage-limit message. Returns a future Date or null. */
function parseResetTime(e: unknown): Date | null {
  const msg = errText(e);
  // 1) explicit unix epoch seconds (10 digits) or ms (13)
  const epoch = msg.match(/\b(1[0-9]{9})(\d{3})?\b/);
  if (epoch) {
    const ms = epoch[2] ? Number(epoch[1] + epoch[2]) : Number(epoch[1]) * 1000;
    const d = new Date(ms);
    if (d.getTime() > Date.now()) return d;
  }
  // 2) ISO timestamp
  const iso = msg.match(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/);
  if (iso) {
    const d = new Date(iso[0]);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) return d;
  }
  // 3) "in 2 hours" / "in 45 minutes"
  const rel = msg.match(/in\s+(\d+)\s*(hour|hr|minute|min)/i);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const ms = /h/.test(unit) ? n * 3600_000 : n * 60_000;
    return new Date(Date.now() + ms);
  }
  // 4) clock time "reset at 3:00 PM" / "resets at 15:00" -> next occurrence (local)
  const clock = msg.match(/reset[s]?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (clock) {
    const now = new Date();
    let h = Number(clock[1]);
    const m = Number(clock[2]);
    const ap = clock[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1); // next occurrence
    return d;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A tiny request to check whether the usage limit has cleared. */
async function probeUsageCleared(opts: RunOptions): Promise<boolean> {
  const restore = applyAuth(opts.cfg);
  try {
    const sdk = await loadSdk();
    const query = sdk.query as (args: any) => AsyncGenerator<any>;
    const stream = query({ prompt: "ok", options: { model: opts.cfg.models.worker, maxTurns: 1, allowedTools: [] } });
    for await (const _ of stream) {
      /* if it streams at all, we're not limited */
    }
    return true;
  } catch (e) {
    if (isUsageLimitError(e)) return false; // still limited
    return true; // some other error — let the real call surface it
  } finally {
    restore();
  }
}

/** Sleep for ms, updating the status countdown so the dashboard shows it's paused, not hung. */
async function sleepWithCountdown(ms: number, resumeAt: Date, reason: string) {
  const CHUNK = 30_000;
  let remaining = ms;
  while (remaining > 0) {
    const mins = Math.ceil((resumeAt.getTime() - Date.now()) / 60000);
    status.pause(resumeAt.toISOString(), `${reason} — resuming in ~${Math.max(0, mins)} min`);
    log.activity("usage", `⏸ paused: ${reason}; resuming ~${resumeAt.toLocaleTimeString()} (~${Math.max(0, mins)} min)`);
    await sleep(Math.min(CHUNK, remaining));
    remaining -= CHUNK;
  }
}

/**
 * Wait out a usage-limit window, then return so the caller can retry. Loops:
 * sleep until the parsed reset (or a poll interval), probe, and either resume
 * or keep waiting. Bounded by FORGE_USAGE_MAX_WAIT_HOURS (0 = unlimited).
 */
async function waitForUsageReset(opts: RunOptions, hint: unknown): Promise<void> {
  const cfg = opts.cfg;
  const startedWait = Date.now();
  const maxMs = cfg.usageMaxWaitHours > 0 ? cfg.usageMaxWaitHours * 3600_000 : Infinity;
  let hintForParse: unknown = hint;

  log.warn("usage", "Plan usage limit reached. Pausing — the engine will wait and resume automatically (work already done is checkpointed).");

  for (;;) {
    const reset = parseResetTime(hintForParse);
    const pollMs = cfg.usagePollMinutes * 60_000;
    const resumeAt = reset ?? new Date(Date.now() + pollMs);
    const waitMs = Math.max(60_000, resumeAt.getTime() - Date.now()); // at least 1 min
    log.warn(
      "usage",
      reset
        ? `Limit resets ~${resumeAt.toLocaleString()}. Sleeping until then, then resuming.`
        : `No reset time given. Checking again every ${cfg.usagePollMinutes} min until it clears.`
    );
    await sleepWithCountdown(waitMs + 5_000, resumeAt, "Plan usage limit");

    if (Date.now() - startedWait > maxMs) {
      throw new Error(`Usage-limit wait exceeded FORGE_USAGE_MAX_WAIT_HOURS (${cfg.usageMaxWaitHours}h). Aborting.`);
    }

    log.info("usage", "Checking whether the usage limit has reset…");
    if (await probeUsageCleared(opts)) {
      status.resume();
      log.ok("usage", "Usage limit has reset. Resuming work.");
      return;
    }
    hintForParse = null; // after the first window, just poll
  }
}

/**
 * Run a single agent task to completion. Two layers of resilience:
 *  1. Transient transport crashes / rate trips: retry 3× with backoff.
 *  2. Plan USAGE-LIMIT exhaustion: pause and wait for reset, then resume —
 *     so a long run rides out usage windows instead of failing. Unbounded by
 *     default (FORGE_USAGE_MAX_WAIT_HOURS=0) so it can run for days/weeks.
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  for (;;) {
    try {
      return await runAgentTransient(opts);
    } catch (e) {
      if (e instanceof SteeringInterrupt) {
        log.info("steer", "Restarting the step with your guidance applied…");
        continue; // re-run; drainSteering() injects the message on the next call
      }
      if (cfgWaitsOnUsage(opts.cfg) && isUsageLimitError(e)) {
        await waitForUsageReset(opts, e);
        continue; // limit cleared — retry the whole task (checkpointed work is skipped)
      }
      // A generic repeated crash MIGHT be a usage limit hiding behind exit-1.
      if (cfgWaitsOnUsage(opts.cfg) && isTransientTransportError(e)) {
        const cleared = await probeUsageCleared(opts);
        if (!cleared) {
          await waitForUsageReset(opts, e);
          continue;
        }
      }
      throw e;
    }
  }
}

function cfgWaitsOnUsage(cfg: ForgeConfig): boolean {
  return cfg.waitOnUsageLimit !== false;
}

/** Transient-retry layer (subprocess crashes / brief rate trips). */
async function runAgentTransient(opts: RunOptions): Promise<RunResult> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runAgentOnce(opts);
    } catch (e) {
      lastErr = e;
      if (e instanceof SteeringInterrupt) throw e; // let runAgent restart it
      // Don't burn transient retries on a usage limit — let runAgent handle it.
      if (isUsageLimitError(e)) throw e;
      if (attempt < maxAttempts && isTransientTransportError(e)) {
        const backoff = 1500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 750);
        log.warn(
          "agent",
          `Transient agent error (attempt ${attempt}/${maxAttempts}): ${(e as Error).message?.slice(0, 80)}. Retrying in ${Math.round(backoff / 1000)}s…`
        );
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function runAgentOnce(opts: RunOptions): Promise<RunResult> {
  const restore = applyAuth(opts.cfg);
  try {
    const sdk = await loadSdk();
    const query = sdk.query as (args: any) => AsyncGenerator<any>;

    const mcpServers = buildResearchMcpServers(opts.cfg);
    const allowedTools = [
      ...(opts.allowedTools ?? ["WebSearch", "WebFetch", "Read", "Write", "Glob", "Grep"]),
      // include MCP tool namespaces if servers are configured
      ...Object.keys(mcpServers).map((n) => `mcp__${n}`),
    ];

    let text = "";
    let turns = 0;
    let costUsd: number | undefined;
    let raw: unknown;
    let gotResult = false;

    // Operator steering: pull any mid-run guidance and inject it so the agent
    // follows it on this call (e.g. "I updated the API key — retry properly").
    const steer = drainSteering();
    // Standing operator DECISIONS (directives) are binding on every call.
    const directives = activeDirectivesText();
    const preamble = [directives, steer && `OPERATOR STEERING (mid-run guidance — follow this):\n${steer}`]
      .filter(Boolean)
      .join("\n\n");
    const promptText = preamble
      ? `${preamble}\n\n---\n\n${opts.prompt}`
      : opts.prompt;
    if (steer) {
      log.info("steer", "Applying operator steering to this step.");
      status.activity(`[${opts.label ?? "agent"}] 🧭 steering applied: ${steer.replace(/\s+/g, " ").slice(0, 80)}…`);
    }
    if (directives) {
      status.activity(`[${opts.label ?? "agent"}] 📌 honoring ${listDirectivesCount()} standing decision(s)`);
    }

    // Universal feedback: every agent call (not just research) reports activity.
    const label = opts.label ?? "agent";
    const startedAt = Date.now();
    let lastBeatMsg = opts.intent ? opts.intent : "starting…";

    const emitActivity = (a: { kind: string; detail: string }) => {
      const icon =
        a.kind === "search" ? "🔍" : a.kind === "fetch" ? "🌐" : a.kind === "thinking" ? "💭" : a.kind === "writing" ? "✍" : "⚙";
      lastBeatMsg = `${a.kind}${a.detail ? ": " + a.detail : ""}`;
      log.activity(label, `${icon} ${a.kind}${a.detail ? ": " + a.detail : ""}`);
      status.activity(`[${label}] ${icon} ${a.kind}${a.detail ? ": " + a.detail : ""}`);
      if (opts.onActivity) opts.onActivity(a);
    };

    // Announce intent up front so even a tool-less reasoning phase (decide,
    // synthesize, profile) says WHAT it's doing instead of just spinning.
    if (opts.intent) emitActivity({ kind: "start", detail: opts.intent });

    // Best-effort mid-stream interrupt: if the operator sends an URGENT steering
    // message, abort this call so it restarts and picks up the guidance now.
    const ac = new AbortController();
    let interrupted = false;

    // Heartbeat: shows it's alive with elapsed seconds, turn count, and the last
    // thing it did — so a silent thinking phase still reports progress. Also
    // checks for an urgent steering interrupt.
    const beat = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      status.note(`${label}: ${lastBeatMsg} · ${turns} turn(s) · ${secs}s`);
      if (hasUrgent()) {
        clearUrgent();
        interrupted = true;
        log.warn("steer", "Urgent steering received — interrupting current step to apply it.");
        try {
          ac.abort();
        } catch {
          /* abort may be unsupported; falls back to between-call injection */
        }
      }
    }, 4000);

    const stream = query({
      prompt: promptText,
      options: {
        model: opts.model,
        systemPrompt: opts.systemPrompt,
        abortController: ac,
        allowedTools,
        permissionMode: opts.permissionMode ?? "acceptEdits",
        cwd: opts.cwd ?? process.cwd(),
        maxTurns: opts.maxTurns ?? opts.cfg.maxTurns,
        ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
        ...(opts.cfg.auth === "apikey" && opts.cfg.maxBudgetUsd
          ? { maxBudgetUsd: opts.cfg.maxBudgetUsd }
          : {}),
      },
    });

    try {
      for await (const message of stream) {
        if (message.type === "assistant") {
          turns++;
          const content = message.message?.content ?? [];
          for (const block of content) {
            if (block.type === "text") {
              text += block.text;
              // Surface a short snippet of streamed reasoning so non-tool phases
              // show real progress, not just "thinking".
              const snip = String(block.text).replace(/\s+/g, " ").trim().slice(0, 90);
              if (snip) emitActivity({ kind: "thinking", detail: `${snip}…` });
            } else if (block.type === "thinking" || block.type === "redacted_thinking") {
              const t = String(block.thinking ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
              if (t) emitActivity({ kind: "thinking", detail: `${t}…` });
            } else if (block.type === "tool_use") {
              emitActivity(describeToolUse(block));
            }
          }
        } else if (message.type === "result") {
          raw = message;
          gotResult = true;
          costUsd = message.total_cost_usd ?? message.cost_usd;
          if (message.result && typeof message.result === "string") {
            text = message.result;
          }
        }
      }
    } catch (e) {
      // An abort (urgent steering) surfaces as an error from the stream; treat
      // it as an interrupt-to-restart rather than a failure.
      if (interrupted) throw new SteeringInterrupt();
      throw e;
    } finally {
      clearInterval(beat);
    }

    // If we were asked to interrupt and didn't already get a full result, restart.
    if (interrupted && !gotResult) throw new SteeringInterrupt();

    return { text, turns, costUsd, raw };
  } finally {
    restore();
  }
}

/** Thrown when the operator sends urgent steering mid-call; runAgent restarts. */
export class SteeringInterrupt extends Error {
  constructor() {
    super("Interrupted by operator steering — restarting step.");
  }
}

/** Turn a tool_use block into a short human line, e.g. 🔍 search: "…". */
function describeToolUse(block: any): { kind: string; detail: string } {
  const name: string = block.name ?? "tool";
  const input = block.input ?? {};
  // Capture the FULL query/URL for the persistent log and scrolling terminal
  // (which wrap naturally). The dashboard shortens for its fixed width itself.
  // The cap here only guards against a pathological multi-KB tool input.
  const CAP = 1000;
  if (/search/i.test(name)) return { kind: "search", detail: String(input.query ?? "").slice(0, CAP) };
  if (/fetch/i.test(name)) return { kind: "fetch", detail: String(input.url ?? "").slice(0, CAP) };
  return { kind: name, detail: JSON.stringify(input).slice(0, CAP) };
}

/**
 * Convenience: run an agent and parse a single JSON object from its output.
 * The agent is instructed (in its system prompt) to emit ONLY JSON.
 */
export async function runAgentJson<T>(opts: RunOptions): Promise<{ data: T; meta: RunResult }> {
  const meta = await runAgent(opts);
  const data = extractJson<T>(meta.text);
  return { data, meta };
}

/** Pull the first balanced, VALID JSON object/array out of a string. Tolerant of
 *  prose or stray brackets (e.g. "[remedy] {...}") by trying each candidate start
 *  and skipping ones that don't parse, rather than committing to the first bracket. */
export function extractJson<T>(s: string): T {
  const cleaned = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  let searchFrom = 0;
  let lastErr: Error | null = null;
  while (true) {
    const rel = cleaned.slice(searchFrom).search(/[\[{]/);
    if (rel === -1) break;
    const start = searchFrom + rel;
    const open = cleaned[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let end = -1;
    let inStr = false;
    let esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end !== -1) {
      const slice = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(slice) as T;
      } catch (e) {
        lastErr = e as Error; // false positive (e.g. "[remedy]") — keep scanning
      }
    }
    searchFrom = start + 1;
  }
  throw new Error("No parseable JSON found in agent output:\n" + s.slice(0, 400) + (lastErr ? `\n(last parse error: ${lastErr.message})` : ""));
}

export function authBanner(cfg: ForgeConfig): void {
  if (cfg.auth === "subscription") {
    log.info(
      "auth",
      "Using your Claude Code subscription session (OAuth). For automated/high-volume runs, switch FORGE_AUTH=apikey."
    );
  } else {
    log.info("auth", "Using pay-as-you-go API key. Budget cap: $" + cfg.maxBudgetUsd);
  }
}
