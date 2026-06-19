// src/lib/channel-policy.ts
// The automate-vs-gate policy, encoded as data the planner and gate layer
// enforce. This is the safety core of the growth module: it is deliberately
// conservative and grounded in real platform ToS and email law (2025–2026).
//
// GUIDING RULE (from the operator's policy):
//   EXECUTE autonomously:  low-risk preparation + actions on your OWN property
//                          (research public sources, draft, on-page SEO,
//                          publish to your own site).
//   GATE (human approves):  anything that contacts a NAMED person/company, or
//                           spends money, or posts to a third-party platform
//                           whose ToS forbids automation.

import type { Channel, ActionClass, GateReason } from "./growth-types.js";

export interface ChannelPolicy {
  channel: Channel;
  // What the agent may do fully autonomously on this channel.
  mayExecute: string[];
  // What is ALWAYS gated to a human, and why.
  mustGate: Array<{ action: string; reason: GateReason }>;
  // Short policy basis the agent should respect (shown in prompts).
  policyBasis: string;
}

export const CHANNEL_POLICY: Record<Channel, ChannelPolicy> = {
  foundational: {
    channel: "foundational",
    mayExecute: [
      "Refine ICP from public signals (job posts, public tech stacks, funding news)",
      "Monitor competitor public content and pricing changes",
      "Draft positioning statements and offer/lead-magnet outlines",
    ],
    mustGate: [
      { action: "Final positioning or pivot decision", reason: "none" },
      { action: "Partnership/referral outreach to a named person", reason: "contacts-named-person" },
      { action: "Paid tools, data, or services", reason: "spends-money" },
    ],
    policyBasis:
      "Internal strategy work is safe to draft autonomously; committing the business to a pivot, contacting partners, or spending money is the operator's call.",
  },

  content: {
    channel: "content",
    mayExecute: [
      "Draft articles, technical guides, and lead magnets",
      "On-page SEO: titles, meta, headings, internal links, schema",
      "Publish to your OWN site after the human-accuracy gate (see below)",
      "Repurpose existing published content into new formats",
    ],
    mustGate: [
      // Content's gate is QUALITY, not external contact: a human must verify
      // technical accuracy and voice before publish, to avoid AI-slop penalties
      // and credibility loss with an expert audience.
      { action: "Publish without human accuracy/voice review", reason: "none" },
      { action: "Paid content distribution / syndication", reason: "spends-money" },
    ],
    policyBasis:
      "Google's scaled-content-abuse policy (Mar 2024 onward) penalizes mass low-value AI content. AI may draft; a human must verify technical accuracy, voice, and originality before publishing. No publishing spikes.",
  },

  linkedin: {
    channel: "linkedin",
    mayExecute: [
      "Draft founder posts in the operator's voice (for the human to post)",
      "Draft comment suggestions and DM messages (for the human to send)",
      "Suggest engagement targets from content the operator already follows",
    ],
    mustGate: [
      { action: "Posting, connecting, or messaging via automation", reason: "contacts-named-person" },
      { action: "Scraping LinkedIn profiles/data", reason: "contacts-named-person" },
      { action: "Any paid LinkedIn promotion", reason: "spends-money" },
    ],
    policyBasis:
      "LinkedIn User Agreement §8.2 prohibits ALL third-party automation, scraping, and automated messaging/connecting. Enforcement is aggressive (Apollo, Seamless, HeyReach, Proxycurl actions 2025). The agent DRAFTS ONLY; the human posts/sends manually. Never automate LinkedIn.",
  },

  coldemail: {
    channel: "coldemail",
    mayExecute: [
      "Research prospects from PUBLIC sources",
      "Build/verify target lists and document a Legitimate Interest Assessment",
      "Draft signal-anchored personalized emails and 3-step sequences",
      "Monitor deliverability metrics (spam rate, bounces) and warn",
    ],
    mustGate: [
      { action: "Sending any email to a named recipient", reason: "contacts-named-person" },
      { action: "Buying domains, inboxes, lists, or sending tools", reason: "spends-money" },
    ],
    policyBasis:
      "Gmail/Yahoo bulk-sender rules require SPF/DKIM/DMARC, one-click unsubscribe, and spam-rate <0.3%. CAN-SPAM/GDPR/PECR govern B2B cold mail. Sending contacts a named person, so the SEND is ALWAYS gated. Never send from the primary Workspace domain; use dedicated warmed domains the operator sets up.",
  },

  community: {
    channel: "community",
    mayExecute: [
      "Draft value-first answers, comments, and Show-HN/post copy",
      "Identify relevant threads/questions from public feeds",
      "Track community reputation norms (karma/age limits, promo ratios)",
    ],
    mustGate: [
      { action: "Posting/commenting on Reddit, HN, Slack, Discord via automation", reason: "contacts-named-person" },
      { action: "Any paid community placement", reason: "spends-money" },
    ],
    policyBasis:
      "Reddit (95/5 promo norm, karma/age gates), Hacker News ('do not paste AI-generated comments', no vote manipulation), and Slack/Discord communities punish automated self-promotion with bans and reputation loss. The agent DRAFTS ONLY; the human participates personally.",
  },
};

/**
 * Decide the action class for a proposed terminal action on a channel.
 * Defaults to GATE when uncertain — fail safe.
 */
export function classifyAction(
  channel: Channel,
  involvesNamedContact: boolean,
  involvesSpend: boolean,
  isThirdPartyPost: boolean
): { actionClass: ActionClass; reason: GateReason } {
  if (involvesSpend) return { actionClass: "gate", reason: "spends-money" };
  if (involvesNamedContact || isThirdPartyPost)
    return { actionClass: "gate", reason: "contacts-named-person" };
  return { actionClass: "execute", reason: "none" };
}

/** Channels whose external action is NEVER auto-executed regardless of task. */
export const NEVER_AUTO_EXECUTE: Channel[] = ["linkedin", "community"];
