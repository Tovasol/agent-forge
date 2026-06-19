// src/harness/directives.ts
// A persistent ledger of OPERATOR DECISIONS ("directives") that become part of
// the venture plan. Unlike transient steering (applied once, then archived), a
// directive:
//   1. persists and is injected into EVERY agent prompt from now on, so the
//      whole pipeline honors it; and
//   2. carries the earliest pipeline phase it affects, so adding it can cascade
//      a redo of that phase and everything downstream (the domino effect).
//
// Example: "site should be professional & bright" affects `build` -> build,
// deploy, optimize redo. "marketing should use Hormozi-style offers" affects
// `research` -> the entire chain redoes with the new lens.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { Phase } from "../lib/types.js";
import { PHASE_ORDER } from "../lib/types.js";

const FILE = resolve(process.cwd(), "memory/directives.json");

export interface Directive {
  id: string;
  text: string;
  fromPhase: Phase; // earliest phase whose output must change
  createdAt: string;
}

function ensure(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}

export function listDirectives(): Directive[] {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

function save(ds: Directive[]) {
  ensure(FILE);
  writeFileSync(FILE, JSON.stringify(ds, null, 2));
}

export function addDirective(text: string, fromPhase: Phase): Directive {
  const ds = listDirectives();
  const d: Directive = {
    id: `d${Date.now().toString(36)}`,
    text: text.trim(),
    fromPhase,
    createdAt: new Date().toISOString(),
  };
  ds.push(d);
  save(ds);
  return d;
}

export function clearDirective(id: string): boolean {
  const ds = listDirectives();
  const next = ds.filter((d) => d.id !== id);
  save(next);
  return next.length !== ds.length;
}

export function clearAllDirectives(): void {
  save([]);
}

/** All active decisions, formatted as a standing-context block for prompts. */
export function activeDirectivesText(): string {
  const ds = listDirectives();
  if (!ds.length) return "";
  return (
    "STANDING OPERATOR DECISIONS (these are binding constraints on the whole venture — honor every one):\n" +
    ds.map((d) => `- ${d.text}`).join("\n")
  );
}

/**
 * Heuristic: the earliest pipeline phase a decision affects. Used when the
 * operator doesn't specify --from. Deliberately conservative — when a decision
 * touches positioning/audience/offer/strategy it lands at `research` so the
 * whole chain re-aligns; pure visual/page changes land at `build`.
 */
export function classifyEarliestPhase(text: string): Phase {
  const t = text.toLowerCase();

  // Research-level: changes the market lens, audience, positioning, offer model,
  // pricing strategy, channel strategy, or overall marketing approach.
  const researchSignals = [
    "market", "audience", "icp", "segment", "positioning", "niche", "competitor",
    "offer", "value prop", "value-prop", "pricing strategy", "price point", "channel",
    "marketing", "hormozi", "brand strategy", "go-to-market", "gtm", "demand", "persona",
    "industry", "vertical", "business model", "monetization",
  ];
  // Decide-level: changes which option/stack/tool/funnel-shape is chosen, given
  // existing research.
  const decideSignals = [
    "use ", "switch to", "instead of", "choose", "stack", "tool", "esp", "crm",
    "database", "funnel shape", "lead magnet", "which option", "go with",
  ];
  // Build-level: visual/design/copy/page/implementation changes.
  const buildSignals = [
    "design", "color", "colour", "bright", "dark", "theme", "font", "layout",
    "style", "look", "ui", "page", "copy", "headline", "hero", "button", "css",
    "responsive", "logo", "image", "professional looking", "modern look",
  ];

  const hit = (sigs: string[]) => sigs.some((s) => t.includes(s));

  // Earliest wins: research > decide > build.
  if (hit(researchSignals)) return "research";
  if (hit(decideSignals)) return "decide";
  if (hit(buildSignals)) return "build";
  // Default: treat an unclassifiable decision as build-level (cheapest cascade)
  // so we don't redo expensive research unless the wording clearly calls for it.
  return "build";
}

/** The phases to re-open for a directive: fromPhase + everything downstream. */
export function cascadeFrom(fromPhase: Phase): Phase[] {
  const i = PHASE_ORDER.indexOf(fromPhase);
  return i < 0 ? [...PHASE_ORDER] : PHASE_ORDER.slice(i);
}
