// src/harness/seed-backlog.ts
// Generates the initial growth backlog tailored to a done-for-you data-pipeline
// service selling to mid-market B2B SaaS data teams. Items are grounded in the
// research: Snowflake-cost teardowns, benchmark challenges, dbt Slack /
// Locally Optimistic communities, Fivetran pricing-change buying triggers, etc.
//
// Every item carries its automate-vs-gate classification up front.

import type { BacklogTask, Channel, ActionClass, GateReason } from "../lib/growth-types.js";

let counter = 0;
function mk(
  channel: Channel,
  title: string,
  unitOfWork: string,
  acceptanceCriteria: string,
  scoring: { reach: number; impact: number; confidence: number; effort: number },
  actionClass: ActionClass,
  gateReason: GateReason,
  recurrence: BacklogTask["recurrence"] = "once"
): BacklogTask {
  const now = new Date().toISOString();
  return {
    id: `g-${String(++counter).padStart(3, "0")}-${channel}`,
    channel,
    title,
    unitOfWork,
    acceptanceCriteria,
    actionClass,
    gateReason,
    ...scoring,
    status: "backlog",
    createdAt: now,
    updatedAt: now,
    recurrence,
    artifacts: [],
    notes: [],
    creditedCalls: 0,
  };
}

export function seedBacklog(): BacklogTask[] {
  return [
    // ── Foundational ──────────────────────────────────────────────────────────
    mk(
      "foundational",
      "Refine ICP from live hiring + stack signals",
      "Research 8–10 mid-market B2B SaaS companies currently hiring data engineers or showing pipeline pain in public sources; extract common stack, triggers, titles.",
      "An updated ICP doc with 8–10 evidenced example accounts and the 3 strongest buying triggers.",
      { reach: 8, impact: 2, confidence: 0.8, effort: 2 },
      "execute",
      "none",
      "weekly"
    ),
    mk(
      "foundational",
      "Monitor data-tooling buying triggers",
      "Check for fresh triggers: Fivetran MAR pricing pain, Fivetran–dbt merger lock-in, Snowflake overage complaints, Informatica/Talend retirements. Log notable items.",
      "A dated trigger log with at least 3 fresh, sourced items the other channels can anchor to.",
      { reach: 7, impact: 2, confidence: 0.7, effort: 1 },
      "execute",
      "none",
      "weekly"
    ),
    mk(
      "foundational",
      "Draft / revise positioning statement",
      "Draft one sharpened positioning statement for the done-for-you pipeline service aimed at the refined ICP.",
      "A one-paragraph positioning draft + 3 alternative angles for the operator to choose.",
      { reach: 6, impact: 3, confidence: 0.6, effort: 1.5 },
      "gate", // final positioning is the operator's call
      "none"
    ),

    // ── Content / SEO (most automatable) ──────────────────────────────────────
    mk(
      "content",
      "Write a Snowflake/Fivetran cost-teardown article",
      "Draft a first-person teardown with real, defensible numbers showing how a specific pipeline pattern cuts warehouse/ingestion cost, with reproducible SQL and a discovery-call CTA.",
      "A publish-ready draft with original numbers, copy-pasteable SQL, meta/SEO, and a clear CTA — flagged for human accuracy review before publish.",
      { reach: 9, impact: 3, confidence: 0.7, effort: 4 },
      "execute", // draft + on-page SEO are autonomous; publish passes the accuracy gate
      "none",
      "weekly"
    ),
    mk(
      "content",
      "Build a small reproducible pipeline benchmark",
      "Draft a benchmark-style post (e.g. DuckDB vs. distributed for a realistic volume) with method, numbers, and honest takeaways.",
      "A draft with a reproducible method, a results table, and a 'when you actually need X' conclusion.",
      { reach: 9, impact: 3, confidence: 0.6, effort: 5 },
      "execute",
      "none"
    ),
    mk(
      "content",
      "Produce the lead-magnet: 23-point pipeline reliability audit",
      "Draft the downloadable audit checklist referenced on the site, tightened for the ICP's real failure modes.",
      "A polished, branded checklist asset ready to gate behind the email capture.",
      { reach: 8, impact: 2, confidence: 0.8, effort: 3 },
      "execute",
      "none"
    ),
    mk(
      "content",
      "On-page SEO pass on all published pages",
      "Audit titles, metas, headings, internal links, and schema across the site; apply fixes.",
      "A diff of on-page improvements applied to the operator's own site.",
      { reach: 6, impact: 1, confidence: 0.8, effort: 1.5 },
      "execute",
      "none",
      "monthly"
    ),

    // ── LinkedIn (DRAFT ONLY) ─────────────────────────────────────────────────
    mk(
      "linkedin",
      "Draft 2 founder posts in the operator's voice",
      "Draft two LinkedIn posts (authority/technical-depth + personal-journey angle) anchored to a current trigger or a content piece. For the human to post.",
      "Two ready-to-post drafts in the founder's voice, each with a hook and a soft CTA. NOT posted by the agent.",
      { reach: 8, impact: 2, confidence: 0.7, effort: 1 },
      "gate",
      "contacts-named-person",
      "weekly"
    ),
    mk(
      "linkedin",
      "Draft comment suggestions for relevant posts",
      "Identify a few public posts from data-leaders the operator follows and draft thoughtful, non-promotional comment suggestions.",
      "3–5 drafted comments for the human to review and post manually.",
      { reach: 6, impact: 1, confidence: 0.6, effort: 1 },
      "gate",
      "contacts-named-person",
      "weekly"
    ),

    // ── Cold email (RESEARCH + DRAFT ONLY; send is gated) ─────────────────────
    mk(
      "coldemail",
      "Build a 15-prospect target list from public sources",
      "Research 15 ICP-fit accounts from public signals, find the right role, document a Legitimate Interest Assessment per prospect.",
      "A 15-row list with role, trigger, public source, and LIA note — no emails sent.",
      { reach: 6, impact: 2, confidence: 0.6, effort: 2 },
      "execute", // research/list-building is autonomous
      "none",
      "weekly"
    ),
    mk(
      "coldemail",
      "Draft a signal-anchored 3-email sequence",
      "Draft a personalized 3-step sequence anchored to each prospect's real trigger. Queue for approval; do NOT send.",
      "A drafted sequence per prospect placed in the approval queue with recipient + copy.",
      { reach: 6, impact: 3, confidence: 0.5, effort: 2 },
      "gate", // the SEND contacts a named person
      "contacts-named-person",
      "weekly"
    ),
    mk(
      "coldemail",
      "Deliverability health check",
      "Check spam-rate/bounce signals for the dedicated sending domains; warn and auto-pause sending if thresholds are near.",
      "A status note; if spam rate approaches 0.1% or bounces >3%, mark the coldemail channel blocked and escalate.",
      { reach: 3, impact: 2, confidence: 0.8, effort: 0.5 },
      "execute",
      "none",
      "weekly"
    ),

    // ── Communities (DRAFT ONLY) ──────────────────────────────────────────────
    mk(
      "community",
      "Draft value-first answers for dbt Slack / r/dataengineering",
      "Find 3 current questions where the operator has real expertise; draft genuinely useful, non-promotional answers for the human to post.",
      "3 drafted answers with source threads, disclosure note, and zero hard-sell. Posted by the human.",
      { reach: 7, impact: 2, confidence: 0.6, effort: 1.5 },
      "gate",
      "contacts-named-person",
      "weekly"
    ),
    mk(
      "community",
      "Draft a Show HN / Locally Optimistic contribution",
      "Draft a value-first post (e.g. the benchmark or teardown) framed for HN or the Locally Optimistic community norms.",
      "A drafted post + title options + the right venue, for the human to submit.",
      { reach: 8, impact: 2, confidence: 0.4, effort: 1.5 },
      "gate",
      "contacts-named-person"
    ),
  ];
}
