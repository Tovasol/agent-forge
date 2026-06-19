# Codified Idea-to-Profitability Loop — Specification

> Generated from the live spec (v1, updated 2026-06-19T20:35:55.749Z).
> This document is derived from the same data records the executor runs, so it stays in sync with the code.

Last change: Seed spec: codified idea-to-profitability loop with marketing woven in (S0–S9).

## How it works

An idea is walked through the stages below in order. Each stage has a checklist the agent completes to concrete deliverables; each item is tagged `live` (needs current market data), `internal` (reasoning), or `mixed`. A stage advances only when its **gate predicate** evaluates true over the idea's typed metrics bag — and, where marked, only after the **operator** supplies real-world evidence (a human gate). Gates can advance, **pivot** back to a named upstream stage, or **kill** the idea. The framework owns the process, not the outcome: a fast, honest kill is a valid success.

The whole framework is **data, not code**: stages, checklists, and gates are versioned records the self-improving meta-loop can rewrite (see "Meta-loop & guardrails"). Marketing is woven throughout — willingness-to-pay is validated only **after** a marketing engine produces qualified demand.

## Stage sequence

0. **Idea intake & framework instantiation**
1. **Niche & problem selection (+ marketing reconnaissance)** _(marketing)_
2. **Offer design & positioning**
3. **Channel selection (Bullseye)** _(marketing)_
4. **Minimal offering, assets & instrumentation**
5. **Marketing engine — traffic & leads** _(marketing)_
6. **Willingness-to-pay validation**
7. **Iteration (offer ↔ marketing)** _(marketing)_
8. **Profitability / default-alive**
9. **Systematize & scale** _(marketing)_

---

### Stage 0: Idea intake & framework instantiation  `#intake` (v1)

**Intent:** turning the raw idea into a structured opportunity grounded in the operator's means

**Why this stage:** Effectuation (bird-in-hand, affordable loss): start from what the operator has and the most they can afford to lose. Instantiate the generic loop for THIS idea.

**Inputs:** the idea/hint; operator means (skills, assets, network, time, capital)

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Inventory the operator's means (skills, assets, network, time, capital). | `internal` | means-inventory.md | Each of the 5 means categories has at least one concrete entry. |
| 2 | Set the affordable-loss ceiling (max money + time the operator will risk). | `internal` | affordable-loss.md | A numeric money cap and a time cap are recorded. |
| 3 | Frame 2–4 distinct directions the idea could become (who has what painful problem). | `internal` | opportunity-directions.md | ≥2 directions, each stated as <segment> has <painful problem>. |

**Gate**

- Predicate: `true`
- Advance when: Means and affordable-loss ceiling are set and ≥2 directions documented.
- Pivot: never → back to `intake`
- Kill: Operator has no means and no affordable loss to risk.
- Human gate: none

**Encodes:** Sarasvathy (effectuation); Aulet (means)

---

### Stage 1: Niche & problem selection (+ marketing reconnaissance)  `#niche` (v1)

**Intent:** finding a starving crowd with an acute, frequent, monetizable problem

**Why this stage:** Hormozi's 4 market indicators (massive pain, purchasing power, easy to target, growing) + YC's problem lenses (popular/growing/urgent/expensive/mandatory/frequent). Listening-based reconnaissance captures the customer's exact language for later marketing.

**Depends on:** intake
**Inputs:** opportunity-directions.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Generate 6–12 candidate segments and score each on the 6 problem lenses + 4 market indicators. | `live` | segments.json | ≥6 segments each with a score across all lenses. |
| 2 | Scan incumbents/alternatives and mine their 2–3 star reviews for gaps (incl. DIY/Excel). | `live` | competitor-gaps.md | ≥3 alternatives with named weaknesses/gaps. |
| 3 | Capture voice-of-customer language from communities where the ICP congregates. | `live` | voc-language.md | ≥10 verbatim phrases customers use about the problem. |
| 4 | Select ONE beachhead niche with an acute, frequent, fundable problem. | `internal` | beachhead.md | One niche chosen with severity rationale; icp_defined=true. |

**Gate**

- Predicate: `segments_evaluated >= 6 && problem_severity >= 7 && icp_defined && voc_language_captured`
- Advance when: An acute (≥7/10), frequent, monetizable problem in a reachable niche, with a VOC language bank.
- Pivot: best problem severity < 7 after honest search → back to `intake`
- Kill: No segment shows an acute, fundable problem (only low-magnitude 'dead zone').
- Human gate: **strategic** (operator must approve/provide evidence)

**Encodes:** Hormozi $100M Offers; YC idea evaluation; Walling niche selection; Dunford (who cares a lot)

---

### Stage 2: Offer design & positioning  `#offer` (v1)

**Intent:** building a Grand Slam Offer that feels stupid to say no to

**Why this stage:** Hormozi Value Equation [(Dream Outcome × Perceived Likelihood) / (Time Delay × Effort)] + Grand Slam Offer 5-step + Dunford positioning + JTBD. The offer, not the product, is the leverage point.

**Depends on:** niche
**Inputs:** beachhead.md; voc-language.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Define the functional/emotional/social job and the Four Forces (push/pull vs anxiety/habit). | `internal` | jtbd.md | All three job dimensions + four forces articulated. |
| 2 | Build the Grand Slam Offer: dream outcome → list obstacles → solutions → delivery vehicles → trim & stack. | `internal` | offer.md | offer_documented=true; a stacked 'category-of-one' bundle exists. |
| 3 | Set value-based premium price (target ≥80% gross margin) with a value stack ≥10× price. | `mixed` | pricing.md | gross_margin_pct ≥ 80 and price anchored to quantified ROI. |
| 4 | Design risk-reversal/guarantee and name the offer (MAGIC). | `internal` | guarantee.md | guarantee_designed=true; offer has a name. |
| 5 | Write the Dunford positioning one-pager (alternatives→attributes→value→who-cares→category→trend). | `mixed` | positioning.md | All 5 positioning components captured. |
| 6 | Spec a lead magnet (7-step) that solves one narrow problem completely. | `internal` | lead-magnet-spec.md | Narrow problem + format + CTA defined. |

**Gate**

- Predicate: `offer_documented && guarantee_designed && gross_margin_pct >= 70`
- Advance when: A documented, named Grand Slam Offer with guarantee, premium pricing, and positioning.
- Pivot: offer cannot reach acceptable margin or differentiation → back to `niche`
- Kill: No viable offer exists for this niche at a sustainable margin.
- Human gate: **strategic** (operator must approve/provide evidence)

**Encodes:** Hormozi $100M Offers; Dunford Obviously Awesome; Christensen/Moesta JTBD

---

### Stage 3: Channel selection (Bullseye)  `#channels` (v1)

**Intent:** choosing the few marketing channels most likely to reach this ICP

**Why this stage:** Weinberg/Mares 'Traction' Bullseye: brainstorm all 19 channels → rank into 3 rings → test the middle ring cheaply. 'Poor distribution — not product — is the number one cause of failure' (Thiel). For a B2B productized service, bias toward cold email, content/SEO, BD/partnerships, community, engineering-as-marketing.

**Depends on:** offer
**Inputs:** beachhead.md; offer.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Brainstorm ≥1 concrete tactic for each of the 19 traction channels. | `internal` | channels-brainstorm.md | channels_brainstormed = 19. |
| 2 | Rank channels into inner/middle/outer rings for THIS ICP and offer. | `mixed` | channels-ranked.md | channels_ranked=true; 3 rings populated. |
| 3 | Pick 2–3 middle-ring channels to test cheaply in parallel. | `internal` | channels-to-test.md | channels_under_test between 2 and 3. |

**Gate**

- Predicate: `channels_brainstormed >= 19 && channels_ranked && channels_under_test >= 2`
- Advance when: A ranked channel portfolio with 2–3 channels selected for cheap parallel testing.
- Pivot: no plausible channel can reach the ICP → back to `niche`
- Kill: The ICP is fundamentally unreachable by any affordable channel.
- Human gate: none

**Encodes:** Weinberg & Mares (Traction / Bullseye)

---

### Stage 4: Minimal offering, assets & instrumentation  `#build` (v1)

**Intent:** building the smallest real offering plus the landing page, lead magnet, and tracking

**Why this stage:** Build the smallest deliverable that fulfills the offer (productize scope; do-it-once → SOP). Stand up a high-converting landing page and the lead magnet, and instrument tracking BEFORE any traffic (Sean Ellis: don't test before tracking is implemented).

**Depends on:** channels, offer
**Inputs:** offer.md; channels-to-test.md; lead-magnet-spec.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Build the smallest offering that fulfills the offer (productized scope + SOP). | `internal` | site/scaffold + SOP.md | offering_live=true; delivery is repeatable. |
| 2 | Build the landing page (5-sec clarity headline, no-nav, ≤5 fields, single CTA, trust signals, <2.5s load). | `internal` | site/scaffold landing page | landing_page_live=true and passes the conversion checklist. |
| 3 | Produce the lead magnet asset. | `internal` | lead-magnet asset | lead_magnet_ready=true. |
| 4 | Instrument analytics/tracking and lead capture end-to-end. | `internal` | tracking + lead store | tracking_instrumented=true; a test lead lands in the store. |

**Gate**

- Predicate: `offering_live && landing_page_live && lead_magnet_ready && tracking_instrumented`
- Advance when: A live offering + converting landing page + lead magnet + working instrumentation.
- Pivot: the offering cannot be built within affordable loss → back to `offer`
- Kill: The minimal offering is infeasible to build/deliver.
- Human gate: none

**Encodes:** Ries (MVP); E-Myth (SOPs); B2B landing-page CRO practice

---

### Stage 5: Marketing engine — traffic & leads  `#marketing-engine` (v1)

**Intent:** manufacturing qualified demand via the Core Four, sequenced for a bootstrapper

**Why this stage:** THE SPINE. You cannot validate willingness-to-pay without first manufacturing qualified demand. Hormozi Core Four in order (warm → content → cold → paid), Rule of 100, cheap parallel Bullseye channel tests (~$1k/~1 month). Respond to inbound within minutes (speed-to-lead).

**Depends on:** build, channels
**Inputs:** channels-to-test.md; site/scaffold; lead magnet asset

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Run warm outreach (Rule of 100, ACA: Acknowledge-Compliment-Ask). | `live` | warm-outreach-log.md | ≥100 warm contacts attempted; replies logged. |
| 2 | Stand up cold-email infrastructure (secondary domains, SPF/DKIM/DMARC, 14-day warmup, verified ≤200 list). | `internal` | cold-email-setup.md | Auth records set; list verified; bounce risk < 2%. |
| 3 | Run a 4–5 step cold sequence (first email <150 words, one CTA, breakup last). | `live` | cold-sequence.md + results | reply_rate_pct recorded for ≥1 full sequence. |
| 4 | Publish content (give-to-ask ~3.5:1) for the chosen content channel. | `live` | content-log.md | ≥1 content asset live with a CTA to the lead magnet. |
| 5 | Test the 2–3 selected channels in parallel cheaply (~$1k / ~1 month) and measure per-channel CPL, reply/opt-in, lead quality. | `live` | channel-test-results.json | Each tested channel has CPL + conversion + quality recorded. |
| 6 | Respond to inbound leads within minutes (speed-to-lead). | `internal` | lead-response-SOP.md | A response process exists and is followed. |

**Gate**

- Predicate: `qualified_leads >= 20 && qualified_traffic_sufficient && best_channel_optin_pct >= 5`
- Advance when: At least one channel produces qualified leads at acceptable CPL, with enough qualified volume for a valid WTP read (B2B opt-in ≥5%).
- Pivot: no channel converts at acceptable CAC after two test batches → back to `channels`
- Kill: Multiple channel batches fail to produce qualified demand at any affordable CAC.
- Human gate: none

**Encodes:** Hormozi $100M Leads (Core Four, Rule of 100); Traction (Bullseye testing); MIT/Oldroyd speed-to-lead; B2B cold-email deliverability practice

---

### Stage 6: Willingness-to-pay validation  `#wtp` (v1)

**Intent:** measuring real payment signals against pre-set kill criteria

**Why this stage:** Now that qualified demand exists, test PAYMENT, not stated intent. PSL 'Volume/Velocity/Value' culminating in willingness to pay; smoke-test/high-bar/concierge/pre-sale. Set kill criteria BEFORE the test. This is the strictest gate; it requires real-world operator evidence.

**Depends on:** marketing-engine
**Inputs:** channel-test-results.json; offer.md; pricing.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Set falsifiable kill criteria before testing (e.g. ≥N pre-orders/deposits by date X). | `internal` | wtp-criteria.md | Numeric threshold + deadline recorded before the test. |
| 2 | Run a pre-sale / high-bar / concierge test and collect real payment signals. 🧑‍💼 | `live` | wtp-test-results.md | prepaid_or_deposits and/or paying_clients recorded from real prospects. |
| 3 | Compare results to criteria and record an advance/pivot/kill verdict. | `internal` | wtp-verdict.md | wtp_confirmed set true/false against the pre-set threshold. |

**Gate**

- Predicate: `wtp_confirmed && (prepaid_or_deposits >= 3 || paying_clients >= 3)`
- Advance when: Real payment signals (≥3 pre-orders/deposits/paying) met the pre-set threshold.
- Pivot: weak payment despite demand → refine offer/price (or niche) → back to `offer`
- Kill: No willingness to pay after genuine demand and a fair test.
- Human gate: **wtp-evidence** (operator must approve/provide evidence)

**Encodes:** PSL Volume/Velocity/Value; Ries (concierge MVP); Blank (customer validation)

---

### Stage 7: Iteration (offer ↔ marketing)  `#iterate` (v1)

**Intent:** finding the single constraint and improving conversion and CAC

**Why this stage:** Hormozi More→Better→New: maximize the winning channel, then fix the single biggest drop-off, then add placements. Marketing learnings feed the offer and the product; re-market. One test per channel per week.

**Depends on:** wtp
**Inputs:** channel-test-results.json; wtp-verdict.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Identify the single biggest drop-off in the funnel (the constraint). | `live` | funnel-analysis.md | The constraining step is named with data. |
| 2 | Apply More/Better/New: refine offer/message/lead-magnet at the constraint and re-market. | `live` | iteration-log.md | A change was shipped and re-measured. |
| 3 | Track LTGP:CAC trending toward target. | `mixed` | unit-economics.md | ltgp_cac_ratio recorded and trending up. |

**Gate**

- Predicate: `ltgp_cac_ratio >= 3`
- Advance when: Conversion/CAC improving; LTGP:CAC trending toward the business's target.
- Pivot: iteration cannot move the constraint → back to `marketing-engine`
- Kill: Economics cannot be made to work after honest iteration.
- Human gate: none

**Encodes:** Hormozi $100M Leads (More/Better/New); Ries (Build-Measure-Learn)

---

### Stage 8: Profitability / default-alive  `#profitability` (v1)

**Intent:** reaching self-financing unit economics and ramen profitability

**Why this stage:** Graham default-alive: on current trajectory reach profitability before cash runs out. Hormozi Client-Financed Acquisition (30-day GP > 2×(CAC+COGS)); LTGP:CAC ≥ target for the human-touch level; ≥80% margin, ~80% B2B retention.

**Depends on:** iterate
**Inputs:** unit-economics.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Verify LTGP:CAC ≥ target for the human-touch level (service ≥6:1; manual/concierge ≥20:1). | `mixed` | ltgp-cac.md | ltgp_cac_ratio ≥ the chosen target. |
| 2 | Verify Client-Financed Acquisition (30-day gross profit > 2×(CAC+COGS)). | `internal` | cfa.md | client_financed=true. |
| 3 | Confirm default-alive (recurring revenue ≥ expenses on current trajectory). | `internal` | default-alive.md | default_alive=true with the calculation shown. |

**Gate**

- Predicate: `client_financed && default_alive && ltgp_cac_ratio >= 6`
- Advance when: Self-financing unit economics and default-alive achieved.
- Pivot: default-dead with slow growth → fix offer/product, not hire → back to `iterate`
- Kill: Cannot reach default-alive within affordable loss.
- Human gate: none

**Encodes:** Graham (default alive); Hormozi (CFA); Scaling Up (Power of One)

---

### Stage 9: Systematize & scale  `#scale` (v1)

**Intent:** compounding the lead machine and reducing founder dependency

**Why this stage:** Only now scale (Blank: premature scaling kills). E-Myth work ON the business; More/Better/New at channel level; recruit Lead Getters (referrals → employees via 3Ds → agencies as time-boxed accelerators → affiliates); scale paid spend only after foundations are perfected.

**Depends on:** profitability
**Inputs:** default-alive.md

**Checklist:**

| # | Item | Data | Deliverable | Verification |
|---|------|------|-------------|--------------|
| 1 | Deepen SOPs; reduce founder dependency; install a lightweight cadence (Rocks, Scorecard, weekly IDS). | `internal` | operating-system.md | SOPs + a weekly scorecard exist. |
| 2 | Add Lead Getters: systematize referrals, then affiliates/partners, then first hires. | `mixed` | lead-getters.md | ≥1 leverage channel beyond founder effort is live. |
| 3 | Apply More/Better/New across channels; add adjacent niches only after the core is systematized. | `live` | scale-log.md | Scaling steps recorded with margin/churn held. |

**Gate**

- Predicate: `ltgp_cac_ratio >= 6 && retention_pct >= 70`
- Advance when: Compounding lead machine with margins, churn, and quality maintained as volume rises.
- Pivot: ratios degrade as volume rises → back to `iterate`
- Kill: Scaling structurally breaks the economics.
- Human gate: **spend** (operator must approve/provide evidence)

**Encodes:** E-Myth; EOS-lite / Scaling Up; Hormozi (Lead Getters, More/Better/New); Blank (Company Building)

---

## Memory architecture

Per idea, namespaced under `memory/loop/ideas/<id>/`:

- **Semantic** (`semantic.json`): durable facts about this idea (ICP, niche, prices, channel results) and the typed **metrics bag** that gate predicates read.
- **Episodic** (`episodic.jsonl`): append-only timestamped events, metrics, verdicts, and **lessons** (Reflexion-style) prepended on re-runs of a stage.
- **Procedural** (`spec.json`): this idea's clone of the versioned loop spec — the process itself, which the meta-loop can evolve.

On intake, the generic spec is cloned into the idea's namespace; the idea then specializes via accumulating semantic/episodic memory. Namespacing prevents cross-idea contamination.

## Meta-loop & guardrails

An outer evaluator-optimizer loop improves the framework over time: it scores each idea-run with a **protected, code-resident objective** (rewarding honest progress to payment/profit and honest early kills — never proxy activity), writes verbal **lessons** to memory, and proposes **process changes** (new checklist items, tightened gates) as structured diffs. Safety:

1. **Hidden, unmodifiable evaluator** — the success metric lives in code, not in the editable spec; the improver cannot see or alter what counts as success.
2. **Empirical regression gate** — a proposed change must pass structural validation **and** a suite of invariant scenarios (e.g. the WTP gate must still require real payment evidence; profit must still require default-alive) before it can be accepted. This is what catches objective-hacking.
3. **Archive + rollback** — every spec version is archived; any change is revertible (`forge meta revert <v>`).
4. **Human approval by default** — changes are proposed, not auto-applied, unless explicitly run with `--auto` (and even then the regression gate must pass).
5. **Re-run only what changed** — after a change, only the affected stages are re-run.

## Operator commands

```
forge idea                          # bootstrap the idea FROM config/brief.json (no retyping)
forge idea --import                 # ...and also fold in prior research/decisions in this folder
forge idea --import --run           # ...and immediately start walking the stages
forge idea new "<your idea>"        # alternatively, instantiate from a typed hint
forge idea import <id>              # fold earlier findings/decisions into an existing idea
forge idea run <id>                 # walk it through stages until a gate needs you
forge idea discuss <id> [--stage X]  # two-way conversation to iron out a stage's details
forge idea status <id>              # see stage progress + metrics
forge idea metric <id> k=v ...      # record real-world evidence (e.g. paying_clients=3)
forge idea pivot <id> <stage>       # send it back to a stage; reopen downstream
forge idea kill <id> "<reason>"     # honest kill
forge meta improve [--auto]         # propose (or auto-apply) a framework improvement
forge meta versions | revert <v>    # framework version history / rollback
forge spec-doc                      # regenerate this document from the live spec
```

> The real test of this framework's correctness is the operator's actual profitability. The gates are honest by design — their value is in refusing to advance on unmet criteria, not in producing documents.
