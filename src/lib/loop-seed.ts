// src/lib/loop-seed.ts
// THE SEED SPEC: the codified idea-to-profitability framework as data records.
// This is the DEFAULT procedural memory. At runtime it is written to disk once,
// then the meta-loop edits the on-disk copy (this file is only the seed).
//
// Corrected master sequence (marketing is the spine; WTP validated AFTER demand):
//   S0 intake → S1 niche/problem → S2 offer → S3 channel-select → S4 build+assets →
//   S5 MARKETING ENGINE → S6 willingness-to-pay → S7 iterate → S8 profitability → S9 scale
//
// Thresholds encoded from the research are HEURISTICS the meta-loop may tune:
//   - LTGP:CAC ≥ 6:1 (one human touch) ... ≥ 20:1 (manual/concierge service)
//   - Client-Financed Acquisition: 30-day GP > 2×(CAC+COGS)
//   - B2B qualified-traffic opt-in/waitlist ≥ 5–10% is a "strong" demand signal
//   - Gross margin ≥ 80%, B2B retention ~80%

import type { LoopSpec, VersionedStage } from "./loop-schema.js";

const S0: VersionedStage = {
  id: "intake",
  version: 1,
  order: 0,
  title: "Idea intake & framework instantiation",
  intent: "turning the raw idea into a structured opportunity grounded in the operator's means",
  rationale:
    "Effectuation (bird-in-hand, affordable loss): start from what the operator has and the most they can afford to lose. Instantiate the generic loop for THIS idea.",
  inputs: ["the idea/hint", "operator means (skills, assets, network, time, capital)"],
  checklist: [
    { id: "means", text: "Inventory the operator's means (skills, assets, network, time, capital).", dataNeed: "internal", deliverable: "means-inventory.md", verification: "Each of the 5 means categories has at least one concrete entry." },
    { id: "afford", text: "Set the affordable-loss ceiling (max money + time the operator will risk).", dataNeed: "internal", deliverable: "affordable-loss.md", verification: "A numeric money cap and a time cap are recorded." },
    { id: "directions", text: "Frame 2–4 distinct directions the idea could become (who has what painful problem).", dataNeed: "internal", deliverable: "opportunity-directions.md", verification: "≥2 directions, each stated as <segment> has <painful problem>." },
  ],
  deliverables: ["means-inventory.md", "affordable-loss.md", "opportunity-directions.md"],
  gate: {
    predicate: "true",
    advance: "Means and affordable-loss ceiling are set and ≥2 directions documented.",
    pivot: { when: "never", toStage: "intake" },
    kill: "Operator has no means and no affordable loss to risk.",
    human: "none",
  },
  dependencies: [],
  marketing: false,
  sources: ["Sarasvathy (effectuation)", "Aulet (means)"],
};

const S1: VersionedStage = {
  id: "niche",
  version: 1,
  order: 1,
  title: "Niche & problem selection (+ marketing reconnaissance)",
  intent: "finding a starving crowd with an acute, frequent, monetizable problem",
  rationale:
    "Hormozi's 4 market indicators (massive pain, purchasing power, easy to target, growing) + YC's problem lenses (popular/growing/urgent/expensive/mandatory/frequent). Listening-based reconnaissance captures the customer's exact language for later marketing.",
  inputs: ["opportunity-directions.md"],
  checklist: [
    { id: "segments", text: "Generate 6–12 candidate segments and score each on the 6 problem lenses + 4 market indicators.", dataNeed: "live", deliverable: "segments.json", verification: "≥6 segments each with a score across all lenses." },
    { id: "competitors", text: "Scan incumbents/alternatives and mine their 2–3 star reviews for gaps (incl. DIY/Excel).", dataNeed: "live", deliverable: "competitor-gaps.md", verification: "≥3 alternatives with named weaknesses/gaps." },
    { id: "voc", text: "Capture voice-of-customer language from communities where the ICP congregates.", dataNeed: "live", deliverable: "voc-language.md", verification: "≥10 verbatim phrases customers use about the problem." },
    { id: "pick", text: "Select ONE beachhead niche with an acute, frequent, fundable problem.", dataNeed: "internal", deliverable: "beachhead.md", verification: "One niche chosen with severity rationale; icp_defined=true." },
  ],
  deliverables: ["segments.json", "competitor-gaps.md", "voc-language.md", "beachhead.md"],
  gate: {
    predicate: "segments_evaluated >= 6 && problem_severity >= 7 && icp_defined && voc_language_captured",
    advance: "An acute (≥7/10), frequent, monetizable problem in a reachable niche, with a VOC language bank.",
    pivot: { when: "best problem severity < 7 after honest search", toStage: "intake" },
    kill: "No segment shows an acute, fundable problem (only low-magnitude 'dead zone').",
    human: "strategic",
  },
  dependencies: ["intake"],
  marketing: true,
  sources: ["Hormozi $100M Offers", "YC idea evaluation", "Walling niche selection", "Dunford (who cares a lot)"],
};

const S2: VersionedStage = {
  id: "offer",
  version: 1,
  order: 2,
  title: "Offer design & positioning",
  intent: "building a Grand Slam Offer that feels stupid to say no to",
  rationale:
    "Hormozi Value Equation [(Dream Outcome × Perceived Likelihood) / (Time Delay × Effort)] + Grand Slam Offer 5-step + Dunford positioning + JTBD. The offer, not the product, is the leverage point.",
  inputs: ["beachhead.md", "voc-language.md"],
  checklist: [
    { id: "jtbd", text: "Define the functional/emotional/social job and the Four Forces (push/pull vs anxiety/habit).", dataNeed: "internal", deliverable: "jtbd.md", verification: "All three job dimensions + four forces articulated." },
    { id: "gso", text: "Build the Grand Slam Offer: dream outcome → list obstacles → solutions → delivery vehicles → trim & stack.", dataNeed: "internal", deliverable: "offer.md", verification: "offer_documented=true; a stacked 'category-of-one' bundle exists." },
    { id: "price", text: "Set value-based premium price (target ≥80% gross margin) with a value stack ≥10× price.", dataNeed: "mixed", deliverable: "pricing.md", verification: "gross_margin_pct ≥ 80 and price anchored to quantified ROI." },
    { id: "guarantee", text: "Design risk-reversal/guarantee and name the offer (MAGIC).", dataNeed: "internal", deliverable: "guarantee.md", verification: "guarantee_designed=true; offer has a name." },
    { id: "positioning", text: "Write the Dunford positioning one-pager (alternatives→attributes→value→who-cares→category→trend).", dataNeed: "mixed", deliverable: "positioning.md", verification: "All 5 positioning components captured." },
    { id: "magnet", text: "Spec a lead magnet (7-step) that solves one narrow problem completely.", dataNeed: "internal", deliverable: "lead-magnet-spec.md", verification: "Narrow problem + format + CTA defined." },
  ],
  deliverables: ["jtbd.md", "offer.md", "pricing.md", "guarantee.md", "positioning.md", "lead-magnet-spec.md"],
  gate: {
    predicate: "offer_documented && guarantee_designed && gross_margin_pct >= 70",
    advance: "A documented, named Grand Slam Offer with guarantee, premium pricing, and positioning.",
    pivot: { when: "offer cannot reach acceptable margin or differentiation", toStage: "niche" },
    kill: "No viable offer exists for this niche at a sustainable margin.",
    human: "strategic",
  },
  dependencies: ["niche"],
  marketing: false,
  sources: ["Hormozi $100M Offers", "Dunford Obviously Awesome", "Christensen/Moesta JTBD"],
};

const S3: VersionedStage = {
  id: "channels",
  version: 1,
  order: 3,
  title: "Channel selection (Bullseye)",
  intent: "choosing the few marketing channels most likely to reach this ICP",
  rationale:
    "Weinberg/Mares 'Traction' Bullseye: brainstorm all 19 channels → rank into 3 rings → test the middle ring cheaply. 'Poor distribution — not product — is the number one cause of failure' (Thiel). For a B2B productized service, bias toward cold email, content/SEO, BD/partnerships, community, engineering-as-marketing.",
  inputs: ["beachhead.md", "offer.md"],
  checklist: [
    { id: "brainstorm", text: "Brainstorm ≥1 concrete tactic for each of the 19 traction channels.", dataNeed: "internal", deliverable: "channels-brainstorm.md", verification: "channels_brainstormed = 19." },
    { id: "rank", text: "Rank channels into inner/middle/outer rings for THIS ICP and offer.", dataNeed: "mixed", deliverable: "channels-ranked.md", verification: "channels_ranked=true; 3 rings populated." },
    { id: "select", text: "Pick 2–3 middle-ring channels to test cheaply in parallel.", dataNeed: "internal", deliverable: "channels-to-test.md", verification: "channels_under_test between 2 and 3." },
  ],
  deliverables: ["channels-brainstorm.md", "channels-ranked.md", "channels-to-test.md"],
  gate: {
    predicate: "channels_brainstormed >= 19 && channels_ranked && channels_under_test >= 2",
    advance: "A ranked channel portfolio with 2–3 channels selected for cheap parallel testing.",
    pivot: { when: "no plausible channel can reach the ICP", toStage: "niche" },
    kill: "The ICP is fundamentally unreachable by any affordable channel.",
    human: "none",
  },
  dependencies: ["offer"],
  marketing: true,
  sources: ["Weinberg & Mares (Traction / Bullseye)"],
};

const S4: VersionedStage = {
  id: "build",
  version: 1,
  order: 4,
  title: "Minimal offering, assets & instrumentation",
  intent: "building the smallest real offering plus the landing page, lead magnet, and tracking",
  rationale:
    "Build the smallest deliverable that fulfills the offer (productize scope; do-it-once → SOP). Stand up a high-converting landing page and the lead magnet, and instrument tracking BEFORE any traffic (Sean Ellis: don't test before tracking is implemented).",
  inputs: ["offer.md", "channels-to-test.md", "lead-magnet-spec.md"],
  checklist: [
    { id: "offering", text: "Build the smallest offering that fulfills the offer (productized scope + SOP).", dataNeed: "internal", deliverable: "site/scaffold + SOP.md", verification: "offering_live=true; delivery is repeatable." },
    { id: "landing", text: "Build the landing page (5-sec clarity headline, no-nav, ≤5 fields, single CTA, trust signals, <2.5s load).", dataNeed: "internal", deliverable: "site/scaffold landing page", verification: "landing_page_live=true and passes the conversion checklist." },
    { id: "magnet", text: "Produce the lead magnet asset.", dataNeed: "internal", deliverable: "lead-magnet asset", verification: "lead_magnet_ready=true." },
    { id: "tracking", text: "Instrument analytics/tracking and lead capture end-to-end.", dataNeed: "internal", deliverable: "tracking + lead store", verification: "tracking_instrumented=true; a test lead lands in the store." },
  ],
  deliverables: ["site/scaffold", "SOP.md", "lead magnet asset", "tracking/lead store"],
  gate: {
    predicate: "offering_live && landing_page_live && lead_magnet_ready && tracking_instrumented",
    advance: "A live offering + converting landing page + lead magnet + working instrumentation.",
    pivot: { when: "the offering cannot be built within affordable loss", toStage: "offer" },
    kill: "The minimal offering is infeasible to build/deliver.",
    human: "none",
  },
  dependencies: ["channels", "offer"],
  marketing: false,
  sources: ["Ries (MVP)", "E-Myth (SOPs)", "B2B landing-page CRO practice"],
};

const S5: VersionedStage = {
  id: "marketing-engine",
  version: 1,
  order: 5,
  title: "Marketing engine — traffic & leads",
  intent: "manufacturing qualified demand via the Core Four, sequenced for a bootstrapper",
  rationale:
    "THE SPINE. You cannot validate willingness-to-pay without first manufacturing qualified demand. Hormozi Core Four in order (warm → content → cold → paid), Rule of 100, cheap parallel Bullseye channel tests (~$1k/~1 month). Respond to inbound within minutes (speed-to-lead).",
  inputs: ["channels-to-test.md", "site/scaffold", "lead magnet asset"],
  checklist: [
    { id: "warm", text: "Run warm outreach (Rule of 100, ACA: Acknowledge-Compliment-Ask).", dataNeed: "live", deliverable: "warm-outreach-log.md", verification: "≥100 warm contacts attempted; replies logged." },
    { id: "coldinfra", text: "Stand up cold-email infrastructure (secondary domains, SPF/DKIM/DMARC, 14-day warmup, verified ≤200 list).", dataNeed: "internal", deliverable: "cold-email-setup.md", verification: "Auth records set; list verified; bounce risk < 2%." },
    { id: "coldseq", text: "Run a 4–5 step cold sequence (first email <150 words, one CTA, breakup last).", dataNeed: "live", deliverable: "cold-sequence.md + results", verification: "reply_rate_pct recorded for ≥1 full sequence." },
    { id: "content", text: "Publish content (give-to-ask ~3.5:1) for the chosen content channel.", dataNeed: "live", deliverable: "content-log.md", verification: "≥1 content asset live with a CTA to the lead magnet." },
    { id: "test", text: "Test the 2–3 selected channels in parallel cheaply (~$1k / ~1 month) and measure per-channel CPL, reply/opt-in, lead quality.", dataNeed: "live", deliverable: "channel-test-results.json", verification: "Each tested channel has CPL + conversion + quality recorded." },
    { id: "respond", text: "Respond to inbound leads within minutes (speed-to-lead).", dataNeed: "internal", deliverable: "lead-response-SOP.md", verification: "A response process exists and is followed." },
  ],
  deliverables: ["warm-outreach-log.md", "cold-email-setup.md", "cold-sequence.md", "content-log.md", "channel-test-results.json"],
  gate: {
    predicate: "qualified_leads >= 20 && qualified_traffic_sufficient && best_channel_optin_pct >= 5",
    advance: "At least one channel produces qualified leads at acceptable CPL, with enough qualified volume for a valid WTP read (B2B opt-in ≥5%).",
    pivot: { when: "no channel converts at acceptable CAC after two test batches", toStage: "channels" },
    kill: "Multiple channel batches fail to produce qualified demand at any affordable CAC.",
    human: "none",
  },
  dependencies: ["build", "channels"],
  marketing: true,
  sources: ["Hormozi $100M Leads (Core Four, Rule of 100)", "Traction (Bullseye testing)", "MIT/Oldroyd speed-to-lead", "B2B cold-email deliverability practice"],
};

const S6: VersionedStage = {
  id: "wtp",
  version: 1,
  order: 6,
  title: "Willingness-to-pay validation",
  intent: "measuring real payment signals against pre-set kill criteria",
  rationale:
    "Now that qualified demand exists, test PAYMENT, not stated intent. PSL 'Volume/Velocity/Value' culminating in willingness to pay; smoke-test/high-bar/concierge/pre-sale. Set kill criteria BEFORE the test. This is the strictest gate; it requires real-world operator evidence.",
  inputs: ["channel-test-results.json", "offer.md", "pricing.md"],
  checklist: [
    { id: "criteria", text: "Set falsifiable kill criteria before testing (e.g. ≥N pre-orders/deposits by date X).", dataNeed: "internal", deliverable: "wtp-criteria.md", verification: "Numeric threshold + deadline recorded before the test." },
    { id: "test", text: "Run a pre-sale / high-bar / concierge test and collect real payment signals.", dataNeed: "live", deliverable: "wtp-test-results.md", verification: "prepaid_or_deposits and/or paying_clients recorded from real prospects.", humanOnly: true },
    { id: "verdict", text: "Compare results to criteria and record an advance/pivot/kill verdict.", dataNeed: "internal", deliverable: "wtp-verdict.md", verification: "wtp_confirmed set true/false against the pre-set threshold." },
  ],
  deliverables: ["wtp-criteria.md", "wtp-test-results.md", "wtp-verdict.md"],
  gate: {
    predicate: "wtp_confirmed && (prepaid_or_deposits >= 3 || paying_clients >= 3)",
    advance: "Real payment signals (≥3 pre-orders/deposits/paying) met the pre-set threshold.",
    pivot: { when: "weak payment despite demand → refine offer/price (or niche)", toStage: "offer" },
    kill: "No willingness to pay after genuine demand and a fair test.",
    human: "wtp-evidence",
  },
  dependencies: ["marketing-engine"],
  marketing: false,
  sources: ["PSL Volume/Velocity/Value", "Ries (concierge MVP)", "Blank (customer validation)"],
};

const S7: VersionedStage = {
  id: "iterate",
  version: 1,
  order: 7,
  title: "Iteration (offer ↔ marketing)",
  intent: "finding the single constraint and improving conversion and CAC",
  rationale:
    "Hormozi More→Better→New: maximize the winning channel, then fix the single biggest drop-off, then add placements. Marketing learnings feed the offer and the product; re-market. One test per channel per week.",
  inputs: ["channel-test-results.json", "wtp-verdict.md"],
  checklist: [
    { id: "constraint", text: "Identify the single biggest drop-off in the funnel (the constraint).", dataNeed: "live", deliverable: "funnel-analysis.md", verification: "The constraining step is named with data." },
    { id: "improve", text: "Apply More/Better/New: refine offer/message/lead-magnet at the constraint and re-market.", dataNeed: "live", deliverable: "iteration-log.md", verification: "A change was shipped and re-measured." },
    { id: "ratio", text: "Track LTGP:CAC trending toward target.", dataNeed: "mixed", deliverable: "unit-economics.md", verification: "ltgp_cac_ratio recorded and trending up." },
  ],
  deliverables: ["funnel-analysis.md", "iteration-log.md", "unit-economics.md"],
  gate: {
    predicate: "ltgp_cac_ratio >= 3",
    advance: "Conversion/CAC improving; LTGP:CAC trending toward the business's target.",
    pivot: { when: "iteration cannot move the constraint", toStage: "marketing-engine" },
    kill: "Economics cannot be made to work after honest iteration.",
    human: "none",
  },
  dependencies: ["wtp"],
  marketing: true,
  sources: ["Hormozi $100M Leads (More/Better/New)", "Ries (Build-Measure-Learn)"],
};

const S8: VersionedStage = {
  id: "profitability",
  version: 1,
  order: 8,
  title: "Profitability / default-alive",
  intent: "reaching self-financing unit economics and ramen profitability",
  rationale:
    "Graham default-alive: on current trajectory reach profitability before cash runs out. Hormozi Client-Financed Acquisition (30-day GP > 2×(CAC+COGS)); LTGP:CAC ≥ target for the human-touch level; ≥80% margin, ~80% B2B retention.",
  inputs: ["unit-economics.md"],
  checklist: [
    { id: "ratio", text: "Verify LTGP:CAC ≥ target for the human-touch level (service ≥6:1; manual/concierge ≥20:1).", dataNeed: "mixed", deliverable: "ltgp-cac.md", verification: "ltgp_cac_ratio ≥ the chosen target." },
    { id: "cfa", text: "Verify Client-Financed Acquisition (30-day gross profit > 2×(CAC+COGS)).", dataNeed: "internal", deliverable: "cfa.md", verification: "client_financed=true." },
    { id: "alive", text: "Confirm default-alive (recurring revenue ≥ expenses on current trajectory).", dataNeed: "internal", deliverable: "default-alive.md", verification: "default_alive=true with the calculation shown." },
  ],
  deliverables: ["ltgp-cac.md", "cfa.md", "default-alive.md"],
  gate: {
    predicate: "client_financed && default_alive && ltgp_cac_ratio >= 6",
    advance: "Self-financing unit economics and default-alive achieved.",
    pivot: { when: "default-dead with slow growth → fix offer/product, not hire", toStage: "iterate" },
    kill: "Cannot reach default-alive within affordable loss.",
    human: "none",
  },
  dependencies: ["iterate"],
  marketing: false,
  sources: ["Graham (default alive)", "Hormozi (CFA)", "Scaling Up (Power of One)"],
};

const S9: VersionedStage = {
  id: "scale",
  version: 1,
  order: 9,
  title: "Systematize & scale",
  intent: "compounding the lead machine and reducing founder dependency",
  rationale:
    "Only now scale (Blank: premature scaling kills). E-Myth work ON the business; More/Better/New at channel level; recruit Lead Getters (referrals → employees via 3Ds → agencies as time-boxed accelerators → affiliates); scale paid spend only after foundations are perfected.",
  inputs: ["default-alive.md"],
  checklist: [
    { id: "systematize", text: "Deepen SOPs; reduce founder dependency; install a lightweight cadence (Rocks, Scorecard, weekly IDS).", dataNeed: "internal", deliverable: "operating-system.md", verification: "SOPs + a weekly scorecard exist." },
    { id: "leadgetters", text: "Add Lead Getters: systematize referrals, then affiliates/partners, then first hires.", dataNeed: "mixed", deliverable: "lead-getters.md", verification: "≥1 leverage channel beyond founder effort is live." },
    { id: "morebetternew", text: "Apply More/Better/New across channels; add adjacent niches only after the core is systematized.", dataNeed: "live", deliverable: "scale-log.md", verification: "Scaling steps recorded with margin/churn held." },
  ],
  deliverables: ["operating-system.md", "lead-getters.md", "scale-log.md"],
  gate: {
    predicate: "ltgp_cac_ratio >= 6 && retention_pct >= 70",
    advance: "Compounding lead machine with margins, churn, and quality maintained as volume rises.",
    pivot: { when: "ratios degrade as volume rises", toStage: "iterate" },
    kill: "Scaling structurally breaks the economics.",
    human: "spend",
  },
  dependencies: ["profitability"],
  marketing: true,
  sources: ["E-Myth", "EOS-lite / Scaling Up", "Hormozi (Lead Getters, More/Better/New)", "Blank (Company Building)"],
};

export const SEED_STAGES: VersionedStage[] = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9];

export function seedSpec(): LoopSpec {
  return {
    specVersion: 1,
    updatedAt: new Date().toISOString(),
    changeNote: "Seed spec: codified idea-to-profitability loop with marketing woven in (S0–S9).",
    stages: SEED_STAGES.map((s) => ({ ...s })),
  };
}
