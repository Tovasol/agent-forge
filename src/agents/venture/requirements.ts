// src/agents/venture/requirements.ts
// Builds the capability-requirements ledger NEEDS-FIRST: derive what the venture
// requires, then mark items satisfied by owned capabilities, and surface gaps
// with informed options. Money/identity/legal gaps become venture gates so the
// operator chooses (and authorizes) — but the engine always tells them the need
// exists, whether or not they already own a solution.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runAgentJson } from "../../lib/agent.js";
import { prompt } from "../../lib/prompts.js";
import { log } from "../../lib/log.js";
import type { ForgeConfig } from "../../lib/types.js";
import type { CapabilityRequirement } from "../../lib/requirements.js";
import { CAPABILITY_CATALOG, matchOwned } from "../../lib/requirements.js";
import { loadProfile } from "./profile.js";
import { loadVenture, readVentureArtifacts, writeVentureArtifact } from "../../harness/venture-state.js";
import { stageGate } from "../../harness/venture-gates.js";
import { recordSpend } from "../../harness/budget.js";

const LEDGER_PATH = resolve(process.cwd(), "memory/venture/requirements.json");

export function loadLedger(): CapabilityRequirement[] {
  if (!existsSync(LEDGER_PATH)) return [];
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as CapabilityRequirement[];
  } catch {
    return [];
  }
}
function saveLedger(reqs: CapabilityRequirement[]) {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(reqs, null, 2));
}

/** Owned capability/asset strings from the operator profile (for matching). */
function ownedStrings(): string[] {
  const p = loadProfile();
  if (!p) return [];
  return [
    ...p.ownedAssets,
    ...p.derivedCapabilities.map((c) => c.capability),
    ...p.derivedCapabilities.map((c) => c.fromAsset),
  ];
}

/**
 * Deterministic baseline ledger: the full catalog, each marked satisfied/gap by
 * owned capabilities. The LLM refines (applicability + venture-specific needs),
 * but this guarantees a correct needs-first checklist even offline.
 */
function deterministicLedger(): CapabilityRequirement[] {
  const owned = ownedStrings();
  return CAPABILITY_CATALOG.map((e) => {
    const sat = matchOwned(e, owned);
    return {
      id: e.id,
      capability: e.capability,
      whyNeeded: e.typicalWhy,
      status: sat ? "satisfied" : "required-gap",
      satisfiedBy: sat ?? undefined,
      options: sat ? [] : e.defaultOptions,
      gateOnFill: e.gateOnFill,
    } as CapabilityRequirement;
  });
}

export async function buildRequirements(cfg: ForgeConfig): Promise<CapabilityRequirement[]> {
  const v = loadVenture();
  const owned = ownedStrings();

  // Always start from the deterministic needs-first baseline.
  let ledger = deterministicLedger();

  // Refine with the LLM using the actual plan artifacts (offer, GTM, model).
  const arts = readVentureArtifacts();
  const planText = Object.entries(arts)
    .filter(([n]) => /offer|gtm|funnel|model|pricing|beachhead|jtbd|value/i.test(n))
    .map(([n, c]) => `### ${n}\n${c.slice(0, 2000)}`)
    .join("\n\n");

  try {
    const { data, meta } = await runAgentJson<{ requirements: CapabilityRequirement[]; summary: string }>({
      cfg,
      model: cfg.models.lead,
      systemPrompt: prompt("needs-analyst"),
      permissionMode: "plan",
      allowedTools: ["WebSearch", "WebFetch"],
      prompt:
        `VENTURE HINT: ${v?.hint ?? "(unknown)"}\n\n` +
        `BUSINESS PLAN ARTIFACTS (derive needs from THESE, as if the operator owns nothing):\n${planText || "(no plan artifacts yet — use the hint and general service-business needs)"}\n\n` +
        `BASELINE CATALOG (select applicable, add venture-specific):\n${JSON.stringify(
          CAPABILITY_CATALOG.map((c) => ({ id: c.id, capability: c.capability, appliesWhen: c.appliesWhen, gateOnFill: c.gateOnFill, defaultOptions: c.defaultOptions })),
          null,
          2
        )}\n\n` +
        `OPERATOR'S OWNED CAPABILITIES (use ONLY to mark items satisfied — do NOT let this shrink the needs):\n${owned.join(", ") || "(none declared)"}\n\n` +
        "Return ONLY the needs-analyst JSON.",
    });
    recordSpend(cfg, meta.costUsd);
    if (data.requirements?.length) {
      // Re-apply deterministic ownership matching on top of the LLM output so a
      // gap is never shown for something the operator demonstrably owns.
      ledger = data.requirements.map((r) => {
        if (r.status === "satisfied") return r;
        const entry = CAPABILITY_CATALOG.find((c) => c.id === r.id);
        const sat = entry ? matchOwned(entry, owned) : null;
        if (sat) return { ...r, status: "satisfied", satisfiedBy: sat, options: [] };
        return r;
      });
    }
    if (data.summary) {
      writeVentureArtifact("build", "requirements-summary.md", `# Capability requirements\n\n${data.summary}`);
    }
  } catch (e) {
    log.warn("requirements", `Needs-analyst LLM unavailable (${(e as Error).message}); using deterministic ledger.`);
  }

  saveLedger(ledger);

  // Raise gates for money/identity/legal gaps so the operator chooses + authorizes.
  for (const r of ledger) {
    if (r.status !== "required-gap") continue;
    if (r.gateOnFill === "none") continue;
    const opts = r.options
      .map((o) => `  - ${o.name} (${o.approxCost})${o.recommended ? " ★ recommended" : ""}: ${o.tradeoffs}`)
      .join("\n");
    const path = writeVentureArtifact(
      "build",
      `gap-${r.id}.md`,
      `# Needed: ${r.capability}\n\nWhy: ${r.whyNeeded}\n\nOptions:\n${opts}\n`
    );
    stageGate(
      "build",
      r.gateOnFill,
      `Choose & set up: ${r.capability}`,
      `Pick an option (recommended: ${r.options.find((o) => o.recommended)?.name ?? "see brief"}) and complete signup/config. The engine prepared the comparison.`,
      [path]
    );
  }

  return ledger;
}

export function reportRequirements(): void {
  const ledger = loadLedger();
  if (!ledger.length) {
    log.raw("No requirements ledger yet. Run `npm run venture:requirements` after a plan exists.");
    return;
  }
  log.raw("\nCapability requirements (what success depends on):");
  for (const r of ledger) {
    if (r.status === "not-applicable") continue;
    const mark = r.status === "satisfied" ? "✓" : r.status === "recommended-gap" ? "◍" : "◻";
    const tail =
      r.status === "satisfied"
        ? `  — covered by ${r.satisfiedBy}`
        : r.options.length
          ? `  → options: ${r.options.map((o) => o.name + (o.recommended ? "★" : "")).join(", ")}`
          : "";
    log.raw(`  ${mark} ${r.capability}${tail}`);
    if (r.status !== "satisfied") log.raw(`      why: ${r.whyNeeded}`);
  }
  const gaps = ledger.filter((r) => r.status === "required-gap").length;
  log.raw(`\n  ${ledger.filter((r) => r.status === "satisfied").length} satisfied · ${gaps} gap(s) to fill.`);
  if (gaps) log.raw("  Money/identity/legal gaps are queued — run `npm run venture:gates`.\n");
}
