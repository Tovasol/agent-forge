// src/lib/stages.ts
// The encoded venture-building pipeline. This is the system's domain expertise:
// it knows WHAT each stage must achieve and WHAT to research, so the operator
// never has to direct it. Synthesized from Blank (Customer Development),
// Ries (Lean Startup), Aulet (Disciplined Entrepreneurship / 24 Steps),
// Fitzpatrick (The Mom Test), Christensen (JTBD), Bezos (one/two-way doors),
// Sarasvathy (effectuation), and service-business GTM practice.

import type { StageDef, StageId } from "./venture-types.js";

export const STAGES: Record<StageId, StageDef> = {
  intake: {
    id: "intake",
    title: "Idea intake & means inventory",
    goal: "Turn a vague hint into a structured opportunity space grounded in the operator's means and an explicit affordable-loss ceiling (effectuation: bird-in-hand, affordable loss).",
    keyQuestions: [
      "What does the operator actually have — skills, assets, network, time, capital?",
      "What is the maximum the operator can afford to lose on this attempt?",
      "What 2–4 distinct directions could this hint become?",
    ],
    inputs: ["the hint", "operator means (from brief/config)"],
    artifacts: ["means-inventory.md", "opportunity-directions.md"],
    exitCriteria: "An affordable-loss ceiling is set and ≥2 plausible directions are documented.",
    gateOnComplete: "none",
    skills: ["effectuation"],
  },

  segmentation: {
    id: "segmentation",
    title: "Market segmentation",
    goal: "Brainstorm wide, then narrow to 6–12 concrete market opportunities with end-user profiles and a mapped decision-making unit (Aulet Step 1).",
    keyQuestions: [
      "Who are the candidate end users and what is their world?",
      "Who is the economic buyer, the champion, the end user (the DMU)?",
      "Which segments have an urgent, frequent, fundable pain?",
    ],
    inputs: ["opportunity-directions.md", "web research"],
    artifacts: ["segments.json"],
    exitCriteria: "6–12 candidate segments documented with end-user profiles and evidence.",
    gateOnComplete: "none",
    skills: ["segmentation"],
  },

  beachhead: {
    id: "beachhead",
    title: "Beachhead selection",
    goal: "Score the segments on a weighted matrix and pick ONE narrow, dominable beachhead market (Aulet Step 2 + Moore's market conditions).",
    keyQuestions: [
      "Which segment scores well ACROSS all criteria (not one extreme high with a fatal low)?",
      "Can the operator deliver a whole product and reach these customers?",
      "Is there a compelling reason to buy now?",
    ],
    inputs: ["segments.json"],
    artifacts: ["beachhead-decision-brief.json", "beachhead.md"],
    exitCriteria: "One beachhead chosen with a full decision brief; operator approves.",
    gateOnComplete: "strategic",
    skills: ["beachhead-scoring", "decision-brief"],
  },

  "profile-tam": {
    id: "profile-tam",
    title: "End-user profile, persona & TAM",
    goal: "Specify exactly who buys and quantify the prize bottom-up (Aulet Steps 3–5).",
    keyQuestions: [
      "What is the single end-user persona?",
      "What is the bottom-up TAM for the beachhead?",
      "Is it large enough to matter, small enough to dominate?",
    ],
    inputs: ["beachhead.md", "web research"],
    artifacts: ["persona.md", "tam.md"],
    exitCriteria: "A persona and a bottom-up TAM are documented and sanity-checked.",
    gateOnComplete: "none",
    skills: ["tam"],
  },

  "jtbd-value": {
    id: "jtbd-value",
    title: "Job-to-be-done & quantified value",
    goal: "Define the job the customer hires the service to do and express the value in the customer's own metrics (Christensen JTBD + Aulet quantified value prop).",
    keyQuestions: [
      "What progress is the customer trying to make (functional, emotional, social)?",
      "What do they use today and what does it cost them?",
      "What is the quantified value (time/$ saved or gained)?",
    ],
    inputs: ["persona.md", "tam.md", "web research"],
    artifacts: ["jtbd.md", "value-proposition.md"],
    exitCriteria: "A value proposition stated in the customer's own metrics.",
    gateOnComplete: "none",
    skills: ["jtbd"],
  },

  "model-offer": {
    id: "model-offer",
    title: "Business model, offer & pricing",
    goal: "Choose the business model and design the productized offer + pricing (favor a fixed-scope, fixed-price productized service for a solo operator).",
    keyQuestions: [
      "Productized service vs. retainer vs. consulting vs. SaaS-like — which fits the persona, margins, and operator skills?",
      "What are the Good/Better/Best tiers and the target middle price?",
      "What does competitor/market pricing intelligence say the band is?",
    ],
    inputs: ["jtbd.md", "value-proposition.md", "web research"],
    artifacts: ["model-decision-brief.json", "offer.md", "pricing.md"],
    exitCriteria: "Model + offer + tiered pricing documented; operator approves.",
    gateOnComplete: "strategic",
    skills: ["business-model", "pricing", "decision-brief"],
  },

  validation: {
    id: "validation",
    title: "Validation / customer discovery",
    goal: "Test demand without lying to yourself: prepare Mom-Test-compliant outreach and an evidence log; the operator sends to named people (contact is gated).",
    keyQuestions: [
      "What are the riskiest assumptions to test first?",
      "What past-behavior questions reveal real pain and real spend?",
      "What commitment (time, reputation, money) signals true demand?",
    ],
    inputs: ["persona.md", "offer.md"],
    artifacts: ["interview-script.md", "outreach-drafts.md", "validation-evidence-log.md"],
    exitCriteria: "Outreach is prepared and queued for the operator to send; an evidence-log template exists. (Real verdicts come after the operator collects responses.)",
    gateOnComplete: "contact",
    skills: ["mom-test"],
  },

  gtm: {
    id: "gtm",
    title: "Go-to-market plan",
    goal: "Design the lead-magnet → funnel → discovery-call → proposal → close motion and the first-10-clients plan.",
    keyQuestions: [
      "What lead magnet fits this persona and job?",
      "Which channels are credible for this buyer?",
      "What is the concrete plan to land the first paying clients manually?",
    ],
    inputs: ["offer.md", "pricing.md", "persona.md"],
    artifacts: ["gtm-plan.md", "lead-magnet-brief.md", "funnel.md"],
    exitCriteria: "A concrete GTM plan and funnel design exist.",
    gateOnComplete: "none",
    skills: ["service-gtm"],
  },

  build: {
    id: "build",
    title: "Build & productize",
    goal: "Build the minimum buyable, deliverable offering: site, capture, funnel, intake, SOPs. (Reuses the engine's build pipeline.)",
    keyQuestions: [
      "What is the minimum that makes the offer buyable and deliverable?",
      "What intake + delivery SOPs are needed?",
    ],
    inputs: ["gtm-plan.md", "offer.md", "funnel.md"],
    artifacts: ["site/", "sops.md"],
    exitCriteria: "A buyable, deliverable offer exists; spend/deploy stay human-gated.",
    gateOnComplete: "none",
    skills: [],
    reusePhase: "build",
  },

  "launch-growth": {
    id: "launch-growth",
    title: "Launch & self-optimizing growth",
    goal: "Launch and run the standing growth backlog toward booked clients, learning from attribution and reallocating effort. (Reuses the growth engine.)",
    keyQuestions: [
      "What is the highest-value growth action available right now?",
      "Which channels are actually producing booked calls?",
    ],
    inputs: ["gtm-plan.md", "site/"],
    artifacts: ["memory/growth/backlog.json"],
    exitCriteria: "The growth loop is running; the operator approves any spend/contact and reviews drafts.",
    gateOnComplete: "none",
    skills: [],
    reusePhase: "growth",
  },
};

export function nextStage(current: StageId | null): StageId | null {
  if (current === null) return STAGE_ORDER[0];
  const i = STAGE_ORDER.indexOf(current);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

import { STAGE_ORDER } from "./venture-types.js";
