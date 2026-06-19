// src/lib/config.ts
// Loads configuration from .env and config/brief.json, with sane defaults.

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ForgeConfig, Autonomy, AuthMode, Brief } from "./types.js";

const ROOT = resolve(process.cwd());

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? "").trim() || fallback;
}

function num(name: string, fallback: number): number {
  const v = parseFloat(env(name));
  return Number.isFinite(v) ? v : fallback;
}

function loadBrief(): Brief {
  const path = resolve(ROOT, "config/brief.json");
  let fileBrief: Partial<Brief> = {};
  if (existsSync(path)) {
    try {
      fileBrief = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      console.warn("[config] config/brief.json is not valid JSON; ignoring.");
    }
  }
  const services = (fileBrief.services && fileBrief.services.length
    ? fileBrief.services
    : ["React", "Cloudflare", "Google Workspace"]);

  return {
    businessName:
      env("FORGE_BUSINESS_NAME") || fileBrief.businessName || "Untitled Venture",
    niche: env("FORGE_NICHE") || fileBrief.niche || "data pipeline service",
    icp: env("FORGE_ICP") || fileBrief.icp || "",
    monthlyBudgetUsd:
      num("FORGE_MONTHLY_BUDGET_USD", fileBrief.monthlyBudgetUsd ?? 50),
    services,
    goal:
      fileBrief.goal ||
      "Launch a lead-magnet website that generates qualified inbound demand for a data pipeline service, then iteratively optimize conversion.",
    notes: fileBrief.notes,
  };
}

export function loadConfig(): ForgeConfig {
  const auth = (env("FORGE_AUTH", "subscription") as AuthMode);
  const autonomy = (env("FORGE_AUTONOMY", "gated") as Autonomy);

  const cfg: ForgeConfig = {
    auth,
    apiKey: env("ANTHROPIC_API_KEY") || undefined,
    models: {
      lead: env("FORGE_MODEL_LEAD", "claude-opus-4-8"),
      worker: env("FORGE_MODEL_WORKER", "claude-sonnet-4-6"),
      cheap: env("FORGE_MODEL_CHEAP", "claude-haiku-4-5-20251001"),
    },
    maxBudgetUsd: num("FORGE_MAX_BUDGET_USD", 25),
    maxTurns: num("FORGE_MAX_TURNS", 120),
    // Subscription auth is more rate-sensitive than a pay-as-you-go API key,
    // so default to gentler concurrency there. Override with FORGE_MAX_PARALLEL_WORKERS.
    maxParallelWorkers: num("FORGE_MAX_PARALLEL_WORKERS", auth === "subscription" ? 2 : 4),
    // Research stops on SATURATION (no new decision-relevant info arriving),
    // judged per-round. These are generous BACKSTOPS / circuit breakers only —
    // they should rarely decide the outcome. Raise them for very broad topics.
    maxResearchWorkers: num("FORGE_MAX_RESEARCH_WORKERS", 12),
    maxResearchRounds: num("FORGE_MAX_RESEARCH_ROUNDS", 4),
    autonomy,
    brief: loadBrief(),
    research: {
      firecrawlKey: env("FIRECRAWL_API_KEY") || undefined,
      exaKey: env("EXA_API_KEY") || undefined,
      tavilyKey: env("TAVILY_API_KEY") || undefined,
    },
    delivery: {
      cloudflareAccountId: env("CLOUDFLARE_ACCOUNT_ID") || undefined,
      cloudflareApiToken: env("CLOUDFLARE_API_TOKEN") || undefined,
      googleServiceAccountJson: env("GOOGLE_SERVICE_ACCOUNT_JSON") || undefined,
      googleSheetsCrmId: env("GOOGLE_SHEETS_CRM_ID") || undefined,
    },
  };

  return cfg;
}

export function validateConfig(cfg: ForgeConfig): string[] {
  const problems: string[] = [];
  if (cfg.auth === "apikey" && !cfg.apiKey) {
    problems.push(
      "FORGE_AUTH=apikey but ANTHROPIC_API_KEY is empty. Set the key or switch to subscription."
    );
  }
  if (cfg.auth === "subscription" && cfg.apiKey) {
    problems.push(
      "FORGE_AUTH=subscription but ANTHROPIC_API_KEY is set — the runtime may prefer the API key. " +
        "Unset ANTHROPIC_API_KEY to guarantee subscription auth."
    );
  }
  if (cfg.maxBudgetUsd <= 0) problems.push("FORGE_MAX_BUDGET_USD must be > 0.");
  return problems;
}
