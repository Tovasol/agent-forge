// src/lib/asset-capabilities.ts
// A deterministic baseline map from commonly-owned assets to the concrete
// capabilities they unlock. The profiler LLM extends this, but this guarantees
// the engine recognizes the big ones (Google Workspace, Cloudflare, etc.) even
// offline — and gives the LLM strong examples to pattern-match against.

import type { DerivedCapability } from "./operator-types.js";

interface AssetRule {
  // match if any of these substrings appear (case-insensitive) in a declared asset
  match: string[];
  capabilities: Array<{ capability: string; howToUse: string }>;
  assetLabel: string;
}

const RULES: AssetRule[] = [
  {
    assetLabel: "Google Workspace",
    match: ["google workspace", "gsuite", "g suite", "google business"],
    capabilities: [
      { capability: "Calendar scheduling / booking pages", howToUse: "Use Google Calendar appointment schedules as the free discovery-call booking page." },
      { capability: "Spreadsheet CRM / database", howToUse: "Use Google Sheets as the zero-infra CRM and lightweight database for leads and pipeline." },
      { capability: "Business email (Gmail)", howToUse: "Send transactional and 1:1 email from Gmail; keep cold outreach on a SEPARATE dedicated domain to protect this one." },
      { capability: "Docs / proposals", howToUse: "Generate proposals, SOPs, and client deliverables in Google Docs." },
      { capability: "Forms / intake", howToUse: "Use Google Forms for client intake and discovery questionnaires." },
      { capability: "Video calls (Meet)", howToUse: "Run discovery and delivery calls on Google Meet." },
    ],
  },
  {
    assetLabel: "Cloudflare",
    match: ["cloudflare"],
    capabilities: [
      { capability: "Website + edge hosting", howToUse: "Host the corporate site and lead-magnet landing pages on Cloudflare Pages/Workers." },
      { capability: "Serverless backend (Workers)", howToUse: "Run the lead-capture API and funnel logic as a Cloudflare Worker." },
      { capability: "Database (D1)", howToUse: "Use Cloudflare D1 for app/lead data when Sheets isn't enough." },
      { capability: "Object storage (R2)", howToUse: "Store lead-magnet assets and downloads in R2." },
      { capability: "DNS + email routing", howToUse: "Manage DNS and set up SPF/DKIM/DMARC; use Email Routing for inbound addresses." },
      { capability: "Scheduled jobs (Cron Triggers)", howToUse: "Run the growth/venture loop on a schedule via Worker Cron Triggers." },
      { capability: "Web analytics", howToUse: "Use free, privacy-friendly Cloudflare Web Analytics for funnel measurement." },
    ],
  },
  {
    assetLabel: "GitHub",
    match: ["github"],
    capabilities: [
      { capability: "Code hosting + CI/CD", howToUse: "Host the build in GitHub; wire Actions for deploys." },
      { capability: "Public credibility", howToUse: "Open-source a small tool as a lead magnet and authority signal." },
    ],
  },
  {
    assetLabel: "A registered domain",
    match: ["domain", "domains"],
    capabilities: [
      { capability: "Brand home + professional email", howToUse: "Point the domain at the site and use it for professional email identity." },
    ],
  },
  {
    assetLabel: "Stripe",
    match: ["stripe"],
    capabilities: [
      { capability: "Payments / checkout / subscriptions", howToUse: "Take payments and recurring subscriptions for the productized service via Stripe Checkout/Payment Links." },
    ],
  },
  {
    assetLabel: "LinkedIn presence",
    match: ["linkedin"],
    capabilities: [
      { capability: "Founder-led distribution", howToUse: "Use an established LinkedIn presence for founder content and warm outreach (drafted by the engine, posted by you)." },
    ],
  },
  {
    assetLabel: "An existing audience / list",
    match: ["audience", "email list", "newsletter", "followers", "subscribers"],
    capabilities: [
      { capability: "Warm launch channel", howToUse: "Launch to the existing audience first — warm demand beats cold every time." },
    ],
  },
  {
    assetLabel: "Notion",
    match: ["notion"],
    capabilities: [
      { capability: "Knowledge base / client portal / SOPs", howToUse: "Use Notion for SOPs, a simple client portal, and internal docs." },
    ],
  },
  {
    assetLabel: "Vercel / Netlify",
    match: ["vercel", "netlify"],
    capabilities: [
      { capability: "Frontend hosting + deploy previews", howToUse: "Host the marketing site with instant deploy previews." },
    ],
  },
];

/** Derive capabilities deterministically from a list of declared assets. */
export function deriveCapabilities(assets: string[]): DerivedCapability[] {
  const out: DerivedCapability[] = [];
  const seen = new Set<string>();
  for (const raw of assets) {
    const a = raw.toLowerCase();
    for (const rule of RULES) {
      if (rule.match.some((m) => a.includes(m))) {
        for (const c of rule.capabilities) {
          const key = rule.assetLabel + "::" + c.capability;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ capability: c.capability, fromAsset: rule.assetLabel, howToUse: c.howToUse });
        }
      }
    }
  }
  return out;
}

/** The canonical asset label for a matched raw asset, for clean display. */
export function canonicalAssets(assets: string[]): string[] {
  const labels = new Set<string>();
  for (const raw of assets) {
    const a = raw.toLowerCase();
    let matched = false;
    for (const rule of RULES) {
      if (rule.match.some((m) => a.includes(m))) {
        labels.add(rule.assetLabel);
        matched = true;
      }
    }
    if (!matched) labels.add(raw.trim());
  }
  return [...labels];
}
