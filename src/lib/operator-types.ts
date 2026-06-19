// src/lib/operator-types.ts
// Types for the operator's context — who they are and what they already have.
// This is the effectuation "bird-in-hand" inventory: the engine starts from the
// operator's real means and threads them through every stage to bias toward
// paths the operator can actually win and execute frugally.

export interface DerivedCapability {
  capability: string; // e.g. "Calendar scheduling / booking pages"
  fromAsset: string; // e.g. "Google Workspace"
  howToUse: string; // e.g. "Use Calendar appointment schedules for discovery-call booking"
}

export interface OperatorProfile {
  builtAt: string;
  // From resumes / CVs.
  skills: string[]; // concrete skills (e.g. "TypeScript", "data pipeline architecture")
  domains: string[]; // domains of expertise (e.g. "B2B SaaS", "ETL/ELT")
  yearsExperience?: number;
  notableachievements: string[];
  credibilitySignals: string[]; // things that build buyer trust (titles, scale, named systems)
  // From the assets file (and resumes).
  ownedAssets: string[]; // raw declared assets (e.g. "Google Workspace", "Cloudflare", "a domain")
  derivedCapabilities: DerivedCapability[]; // what those assets unlock
  constraints: string[]; // time, capital, geography, anything limiting
  // Free-form extras the profiler thought were relevant.
  notes: string[];
  // The raw source files it read (paths), for transparency.
  sources: string[];
}

export function emptyProfile(): OperatorProfile {
  return {
    builtAt: new Date().toISOString(),
    skills: [],
    domains: [],
    notableachievements: [],
    credibilitySignals: [],
    ownedAssets: [],
    derivedCapabilities: [],
    constraints: [],
    notes: [],
    sources: [],
  };
}

/** A compact, prompt-injectable summary of the operator profile. */
export function profileSummary(p: OperatorProfile): string {
  const cap = p.derivedCapabilities
    .map((c) => `    - ${c.capability} (from ${c.fromAsset}): ${c.howToUse}`)
    .join("\n");
  return [
    `OPERATOR PROFILE (start from these real means — bird-in-hand):`,
    p.skills.length ? `  Skills: ${p.skills.join(", ")}` : "",
    p.domains.length ? `  Domains: ${p.domains.join(", ")}` : "",
    p.yearsExperience ? `  Experience: ~${p.yearsExperience} years` : "",
    p.credibilitySignals.length ? `  Credibility: ${p.credibilitySignals.join("; ")}` : "",
    p.notableachievements.length ? `  Achievements: ${p.notableachievements.slice(0, 5).join("; ")}` : "",
    p.ownedAssets.length ? `  Owned assets: ${p.ownedAssets.join(", ")}` : "",
    cap ? `  Capabilities these unlock (PREFER using these — they're free to the operator):\n${cap}` : "",
    p.constraints.length ? `  Constraints: ${p.constraints.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
