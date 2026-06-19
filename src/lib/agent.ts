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
  const msg = (e as Error)?.message ?? String(e);
  return (
    /process exited with code 1/i.test(msg) ||
    /Claude Code process exited/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|429|rate.?limit|overloaded/i.test(msg)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a single agent task to completion and return the final text.
 *
 * Wraps the core call in retry-with-backoff so a transient subprocess crash or
 * rate trip doesn't fail the task (and, via Promise.all upstream, the whole
 * run). Retries up to 3 times with increasing, jittered delay.
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runAgentOnce(opts);
    } catch (e) {
      lastErr = e;
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

    // Universal feedback: every agent call (not just research) reports activity.
    const label = opts.label ?? "agent";
    const startedAt = Date.now();
    let lastBeatMsg = "";
    // Heartbeat so even a silent "thinking" phase shows it's alive on the
    // dashboard and in the log, with elapsed seconds.
    const beat = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      const msg = lastBeatMsg || "working…";
      status.note(`${label}: ${msg} (${secs}s)`);
    }, 5000);

    const emitActivity = (a: { kind: string; detail: string }) => {
      const icon = a.kind === "search" ? "🔍" : a.kind === "fetch" ? "🌐" : a.kind === "thinking" ? "💭" : "⚙";
      lastBeatMsg = `${a.kind}${a.detail ? ": " + a.detail : ""}`;
      log.activity(label, `${icon} ${a.kind}${a.detail ? ": " + a.detail : ""}`);
      status.activity(`[${label}] ${icon} ${a.kind}${a.detail ? ": " + a.detail : ""}`);
      if (opts.onActivity) opts.onActivity(a);
    };

    const stream = query({
      prompt: opts.prompt,
      options: {
        model: opts.model,
        systemPrompt: opts.systemPrompt,
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
          let sawText = false;
          for (const block of content) {
            if (block.type === "text") {
              text += block.text;
              sawText = true;
            } else if (block.type === "tool_use") {
              emitActivity(describeToolUse(block));
            }
          }
          // A turn with reasoning/text but no tool call: pulse so long non-tool
          // phases (decide, synthesize, profile) aren't silent.
          if (sawText) emitActivity({ kind: "thinking", detail: `turn ${turns}` });
        } else if (message.type === "result") {
          raw = message;
          costUsd = message.total_cost_usd ?? message.cost_usd;
          if (message.result && typeof message.result === "string") {
            text = message.result;
          }
        }
      }
    } finally {
      clearInterval(beat);
    }

    return { text, turns, costUsd, raw };
  } finally {
    restore();
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

/** Pull the first balanced JSON object/array out of a string. */
export function extractJson<T>(s: string): T {
  const cleaned = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[\[{]/);
  if (start === -1) throw new Error("No JSON found in agent output:\n" + s.slice(0, 400));
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === open) depth++;
    else if (cleaned[i] === close) {
      depth--;
      if (depth === 0) {
        const slice = cleaned.slice(start, i + 1);
        return JSON.parse(slice) as T;
      }
    }
  }
  throw new Error("Unbalanced JSON in agent output.");
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
