// src/lib/requirements.ts
// The capability-requirements ledger. This is NEEDS-FIRST: the engine derives
// what the venture REQUIRES for success independently of what the operator
// owns, then checks each requirement against owned capabilities. Owned = a
// filled checkmark (time saved). Not owned = a gap the operator must fill, for
// which the engine presents informed options and a frugal recommended default.
//
// The operator's assets NEVER shrink or reshape the requirement list — they
// only mark items satisfied.

import type { GateType } from "./venture-types.js";

export type RequirementStatus =
  | "required-gap" // needed, operator doesn't have it -> options presented
  | "satisfied" // needed, an owned capability fills it -> checkmark
  | "recommended-gap" // not strictly required but advised; operator doesn't have it
  | "not-applicable"; // engine determined this venture doesn't need it

export interface CapabilityOption {
  name: string; // e.g. "Cloudflare Pages", "Cal.com", "Stripe"
  approxCost: string; // e.g. "free tier", "$0–20/mo", "2.9% + 30¢/txn"
  tradeoffs: string; // one line: what you gain/give up
  recommended: boolean; // the frugal default the engine suggests
}

export interface CapabilityRequirement {
  id: string; // canonical id, e.g. "web-hosting"
  capability: string; // human label, e.g. "Web hosting"
  whyNeeded: string; // why success depends on it (or why it's recommended)
  status: RequirementStatus;
  satisfiedBy?: string; // which owned asset/capability fills it, if satisfied
  options: CapabilityOption[]; // informed choices when it's a gap
  // If filling this gap costs money or needs identity/legal, the choice gates.
  gateOnFill: GateType;
}

// The engine's baseline knowledge of capabilities a service business commonly
// needs. The needs-analyst agent SELECTS the applicable subset for the specific
// venture and may ADD venture-specific ones — it does not assume all apply.
// Each entry carries default informed options so even offline the engine can
// present real choices.
export interface CatalogEntry {
  id: string;
  capability: string;
  typicalWhy: string;
  // condition hint for the agent: when does this apply?
  appliesWhen: string;
  gateOnFill: GateType;
  defaultOptions: CapabilityOption[];
  // owned-capability keywords that satisfy this requirement (deterministic match)
  satisfiedByKeywords: string[];
}

export const CAPABILITY_CATALOG: CatalogEntry[] = [
  {
    id: "domain",
    capability: "A domain name",
    typicalWhy: "A professional brand home and email identity buyers can trust.",
    appliesWhen: "Almost always for a real business.",
    gateOnFill: "money",
    defaultOptions: [
      { name: "Cloudflare Registrar", approxCost: "~$10/yr at cost", tradeoffs: "At-cost pricing, integrates with Cloudflare DNS.", recommended: true },
      { name: "Namecheap / Porkbun", approxCost: "~$10–15/yr", tradeoffs: "Cheap, widely used.", recommended: false },
    ],
    satisfiedByKeywords: ["domain", "brand home"],
  },
  {
    id: "web-hosting",
    capability: "Web hosting for the site + lead magnet",
    typicalWhy: "The marketing site and lead-capture pages must be hosted somewhere reliable and fast.",
    appliesWhen: "Whenever there's a website/landing page (almost always).",
    gateOnFill: "money",
    defaultOptions: [
      { name: "Cloudflare Pages/Workers", approxCost: "generous free tier", tradeoffs: "Fast edge hosting; pairs with Workers for the capture API.", recommended: true },
      { name: "Vercel / Netlify", approxCost: "free tier", tradeoffs: "Great DX, deploy previews; can get pricey at scale.", recommended: false },
    ],
    satisfiedByKeywords: ["hosting", "website", "pages", "workers", "vercel", "netlify"],
  },
  {
    id: "lead-store",
    capability: "Lead store / lightweight CRM",
    typicalWhy: "Captured leads and pipeline have to live somewhere you can work them.",
    appliesWhen: "Any funnel that captures leads.",
    gateOnFill: "none",
    defaultOptions: [
      { name: "Google Sheets", approxCost: "free with Workspace", tradeoffs: "Zero infra, hand-editable; fine at low volume.", recommended: true },
      { name: "Cloudflare D1", approxCost: "free tier", tradeoffs: "Queryable SQL; more setup.", recommended: false },
      { name: "Airtable / HubSpot Free", approxCost: "free tier", tradeoffs: "Nicer CRM UX; another tool to manage.", recommended: false },
    ],
    satisfiedByKeywords: ["sheets", "crm", "database", "d1", "airtable", "hubspot", "notion"],
  },
  {
    id: "email-sending",
    capability: "Transactional + outreach email sending",
    typicalWhy: "Confirmation emails and (separately) outreach must deliver reliably without burning your domain.",
    appliesWhen: "Whenever the funnel sends email or you do outbound.",
    gateOnFill: "money",
    defaultOptions: [
      { name: "Resend / Postmark", approxCost: "free tier, then ~$10–15/mo", tradeoffs: "Excellent deliverability for transactional mail.", recommended: true },
      { name: "Cloudflare Email Routing + ESP", approxCost: "free inbound", tradeoffs: "Inbound routing free; still need an ESP to send.", recommended: false },
    ],
    satisfiedByKeywords: ["resend", "postmark", "sendgrid", "mailgun", "ses", "esp", "email sending"],
  },
  {
    id: "calendar-scheduling",
    capability: "Calendar scheduling / booking page",
    typicalWhy: "Discovery-call booking needs a self-serve scheduling link.",
    appliesWhen: "When the funnel ends in a booked call (common for services).",
    gateOnFill: "none",
    defaultOptions: [
      { name: "Cal.com (self-host or cloud)", approxCost: "free / open-source", tradeoffs: "Free, flexible, open-source.", recommended: true },
      { name: "Google Calendar appointment schedules", approxCost: "free with Workspace", tradeoffs: "Zero extra tools if you have Workspace.", recommended: false },
      { name: "Calendly", approxCost: "free tier, then ~$10/mo", tradeoffs: "Polished, widely recognized.", recommended: false },
    ],
    satisfiedByKeywords: ["calendar", "scheduling", "booking", "cal.com", "calendly"],
  },
  {
    id: "payments",
    capability: "Payments / checkout",
    typicalWhy: "Taking money for the service (one-off or subscription) requires a payment processor.",
    appliesWhen: "When clients pay online (buy-now offers, subscriptions, deposits).",
    gateOnFill: "identity",
    defaultOptions: [
      { name: "Stripe", approxCost: "2.9% + 30¢/txn", tradeoffs: "Standard, supports subscriptions + payment links; needs identity/KYC.", recommended: true },
      { name: "Lemon Squeezy / Paddle (MoR)", approxCost: "~5% + fees", tradeoffs: "Handles sales tax as merchant-of-record; higher fee.", recommended: false },
    ],
    satisfiedByKeywords: ["stripe", "payments", "checkout", "paddle", "lemon squeezy"],
  },
  {
    id: "analytics",
    capability: "Web + funnel analytics",
    typicalWhy: "You can't optimize conversion without measuring it.",
    appliesWhen: "Whenever there's a site/funnel to optimize.",
    gateOnFill: "none",
    defaultOptions: [
      { name: "Cloudflare Web Analytics", approxCost: "free", tradeoffs: "Privacy-friendly, no cookie banner; basic.", recommended: true },
      { name: "Plausible / Fathom", approxCost: "~$9–14/mo", tradeoffs: "Privacy-friendly, richer; paid.", recommended: false },
    ],
    satisfiedByKeywords: ["analytics", "cloudflare web analytics", "plausible", "fathom"],
  },
  {
    id: "business-entity",
    capability: "Business entity + banking",
    typicalWhy: "To invoice, take payments, and limit liability you typically need a registered entity and a business bank account.",
    appliesWhen: "Before taking real revenue (can defer for first validation).",
    gateOnFill: "legal",
    defaultOptions: [
      { name: "LLC (home state or WY/DE)", approxCost: "~$50–500 filing", tradeoffs: "Liability protection; some annual upkeep. Requires identity/legal steps.", recommended: true },
      { name: "Sole proprietor (defer)", approxCost: "free", tradeoffs: "Simplest to start; no liability shield. Fine for early validation.", recommended: false },
    ],
    satisfiedByKeywords: ["llc", "entity", "incorporated", "business bank"],
  },
];

/** Deterministically check whether any owned capability/asset satisfies an entry. */
export function matchOwned(entry: CatalogEntry, ownedText: string[]): string | null {
  const hay = ownedText.map((s) => s.toLowerCase());
  for (const kw of entry.satisfiedByKeywords) {
    const hit = hay.find((h) => h.includes(kw));
    if (hit) return hit;
  }
  return null;
}
