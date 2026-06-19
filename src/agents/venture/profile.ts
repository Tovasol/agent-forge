// src/agents/venture/profile.ts
// Builds the operator profile from context files. Combines a deterministic
// asset->capability baseline with an LLM pass over the resume/assets text, then
// persists it so every stage can leverage the operator's real means.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runAgentJson } from "../../lib/agent.js";
import { prompt } from "../../lib/prompts.js";
import { log } from "../../lib/log.js";
import type { ForgeConfig } from "../../lib/types.js";
import type { OperatorProfile } from "../../lib/operator-types.js";
import { emptyProfile } from "../../lib/operator-types.js";
import { deriveCapabilities, canonicalAssets } from "../../lib/asset-capabilities.js";
import { loadContext, contextDirExists } from "../../harness/context-loader.js";
import { recordSpend } from "../../harness/budget.js";

const PROFILE_PATH = resolve(process.cwd(), "memory/venture/operator-profile.json");

export function loadProfile(): OperatorProfile | null {
  if (!existsSync(PROFILE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as OperatorProfile;
  } catch {
    return null;
  }
}

function saveProfile(p: OperatorProfile) {
  mkdirSync(dirname(PROFILE_PATH), { recursive: true });
  writeFileSync(PROFILE_PATH, JSON.stringify(p, null, 2));
}

/**
 * Build (or rebuild) the operator profile from the context/ directory.
 * Falls back to a config-derived profile if no context files or no LLM.
 */
export async function buildProfile(cfg: ForgeConfig, opts: { force?: boolean } = {}): Promise<OperatorProfile> {
  const existing = loadProfile();
  if (existing && !opts.force) return existing;

  const docs = await loadContext();
  if (!docs.length) {
    // No context files — seed from the brief's declared services so the engine
    // still benefits from known assets (e.g. Cloudflare, Google Workspace).
    const p = emptyProfile();
    p.ownedAssets = canonicalAssets(cfg.brief.services);
    p.derivedCapabilities = deriveCapabilities(cfg.brief.services);
    p.notes.push("No files in context/. Profile seeded from declared services in config. Drop resumes + an assets.txt in context/ for a richer profile.");
    saveProfile(p);
    log.info("profile", `No context files; seeded ${p.derivedCapabilities.length} capabilities from declared assets.`);
    return p;
  }

  log.step("profile", `Reading ${docs.length} context file(s): ${docs.map((d) => d.path).join(", ")}`);

  // Deterministic baseline from any assets mentioned (in the assets doc + brief).
  const assetsText = docs.filter((d) => d.kind === "assets").map((d) => d.text).join("\n");
  const declaredAssets = [
    ...cfg.brief.services,
    ...extractAssetLines(assetsText),
  ];
  const baselineCaps = deriveCapabilities(declaredAssets);

  const resumeText = docs
    .filter((d) => d.kind !== "assets")
    .map((d) => `### ${d.path}\n${d.text.slice(0, 12000)}`)
    .join("\n\n");

  let profile = emptyProfile();
  try {
    const { data, meta } = await runAgentJson<Omit<OperatorProfile, "builtAt" | "sources">>({
      cfg,
      model: cfg.models.lead,
      systemPrompt: prompt("operator-profiler"),
      label: "profile",
      intent: "reading your resume & assets → building your operator profile",
      permissionMode: "plan",
      allowedTools: [],
      prompt:
        "Build the operator profile from these documents.\n\n" +
        (resumeText ? `RESUME / CV TEXT:\n${resumeText}\n\n` : "") +
        (assetsText ? `DECLARED ASSETS / OWNERSHIP:\n${assetsText.slice(0, 6000)}\n\n` : "") +
        "DETERMINISTIC CAPABILITY BASELINE (already derived from known assets — keep these and ADD more you infer):\n" +
        JSON.stringify(baselineCaps, null, 2) +
        "\n\nReturn ONLY the profile JSON.",
    });
    recordSpend(cfg, meta.costUsd);
    profile = { ...emptyProfile(), ...data };
  } catch (e) {
    log.warn("profile", `LLM profiling unavailable (${(e as Error).message}); using deterministic baseline only.`);
    profile.ownedAssets = canonicalAssets(declaredAssets);
  }

  // Merge deterministic capabilities in (union, baseline wins on dupes).
  const haveKeys = new Set(profile.derivedCapabilities.map((c) => c.fromAsset + "::" + c.capability));
  for (const c of baselineCaps) {
    const k = c.fromAsset + "::" + c.capability;
    if (!haveKeys.has(k)) profile.derivedCapabilities.push(c);
  }
  if (!profile.ownedAssets.length) profile.ownedAssets = canonicalAssets(declaredAssets);

  profile.builtAt = new Date().toISOString();
  profile.sources = docs.map((d) => d.path);
  saveProfile(profile);
  log.ok(
    "profile",
    `Profile built: ${profile.skills.length} skills, ${profile.ownedAssets.length} assets, ${profile.derivedCapabilities.length} capabilities.`
  );
  return profile;
}

/** Pull asset-ish lines out of free text (bullets / comma lists). */
function extractAssetLines(text: string): string[] {
  if (!text) return [];
  const parts: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue; // skip comments/headers
    const cleaned = line.replace(/^[\s*\-•\d.]+/, "").trim();
    if (!cleaned || cleaned.startsWith("#")) continue;
    // drop obvious non-asset prose (constraints lines, parentheticals-only)
    if (/^(based in|budget|~?\d+\s*hours|constraints)/i.test(cleaned)) continue;
    for (const piece of cleaned.split(/[,;]/)) {
      const p = piece.replace(/[()]/g, "").trim();
      if (p.length > 1 && p.length < 60) parts.push(p);
    }
  }
  return parts;
}

export function reportProfile(): void {
  const p = loadProfile();
  if (!p) {
    log.raw("No operator profile yet. Add files to context/ and run `npm run venture:context`.");
    return;
  }
  log.raw(`\nOperator profile (built ${p.builtAt}):`);
  if (p.sources.length) log.raw(`  Sources: ${p.sources.join(", ")}`);
  if (p.skills.length) log.raw(`  Skills: ${p.skills.join(", ")}`);
  if (p.domains.length) log.raw(`  Domains: ${p.domains.join(", ")}`);
  if (p.yearsExperience) log.raw(`  Experience: ~${p.yearsExperience} yrs`);
  if (p.credibilitySignals.length) log.raw(`  Credibility: ${p.credibilitySignals.join("; ")}`);
  log.raw(`  Owned assets: ${p.ownedAssets.join(", ") || "(none)"}`);
  log.raw(`  Capabilities unlocked:`);
  for (const c of p.derivedCapabilities) log.raw(`    • ${c.capability}  ← ${c.fromAsset}`);
  if (p.constraints.length) log.raw(`  Constraints: ${p.constraints.join("; ")}`);
  log.raw("");
}
