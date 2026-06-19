# Master Build Plan — Codified Idea-to-Profitability Agentic Loop

This is the persistent checklist for building the codified, idea-agnostic, self-improving
venture framework into Agent Forge. Each item is checked off as completed. If a session runs
out of context, RESUME from the first unchecked item — never cut scope.

Success criterion: the operator's real profitability. The framework is "correct" only if,
run honestly, it advances a real idea toward real revenue. Gates must be honest (refuse to
advance on unmet criteria), not decorative.

Grounding: two research reports (idea-to-profitability synthesis + marketing-woven/meta-loop).
Corrected master sequence (marketing is the spine, WTP validated AFTER a marketing engine exists):
  S0 intake → S1 niche/problem → S2 offer → S3 channel-select → S4 minimal build+assets →
  S5 MARKETING ENGINE (traffic+leads) → S6 willingness-to-pay → S7 iterate(offer↔mktg) →
  S8 profitability → S9 scale.

## Phase A — Versioned, idea-agnostic stage schema  [the spec as data]
- [x] A1. Define the schema types: VersionedStage with {id, version, title, intent, inputs[],
       checklist[{id, text, dataNeed: live|internal, deliverable, verification}], deliverables[],
       gate: {predicate expr, advance, pivot, kill}, dependencies[], marketing flag}.
- [x] A2. Author the 10 stages (S0–S9) as DATA records conforming to the schema, with the
       corrected marketing-woven sequence, each checklist item tagged live/internal with a
       concrete deliverable + verification. Encode real thresholds (LTGP:CAC tiers, opt-in %,
       kill criteria) from the research.
- [x] A3. Make the stage set LOAD FROM DISK (versioned JSON) with the authored TS as the
       default seed — so the meta-loop can rewrite stages without code changes.
- [x] A4. Gate predicate evaluator: safe expression evaluation over a typed metrics/state bag
       (e.g. `paying_clients >= 3 && wtp_confirmed`). No arbitrary eval.

## Phase B — Executor that walks an idea through the stages
- [x] B1. Stage runner: for the current stage, work each checklist item to its deliverable,
       run live-data research where tagged, produce artifacts, then evaluate the gate predicate.
- [x] B2. Advance/pivot/kill control flow honoring dependencies; pivots route back to the named
       upstream stage; kills stop with a recorded rationale.
- [x] B3. Human gates at the points only the operator can satisfy (real WTP evidence, spend,
       identity/legal) — hard-stop and request evidence, don't fabricate proxy proof.
- [x] B4. CLI surface: instantiate/run/status/resume against the new schema; integrate with
       existing memory, snapshots, steering, overnight, decisions.

## Phase C — Marketing woven in as first-class, never-skippable stages
- [x] C1. Author S1 reconnaissance, S3 Bullseye channel-selection, S5 marketing-engine, S7
       iteration checklists with codified mechanics (cold-email infra/sequence, content/SEO
       pillar-cluster, landing-page conversion rules, Rule of 100, Core Four ordering).
- [x] C2. Per-channel test sub-loop (orchestrator-workers): brainstorm 19 → rank rings → test
       middle ring cheaply in parallel → focus the bullseye → metrics gate (CPL, reply/opt-in).
- [x] C3. WTP gate keyed to qualified-traffic sufficiency (cannot test price without demand).

## Phase D — Three-layer memory (generic loop → idea-specific, accumulating)
- [x] D1. Semantic store (idea facts: ICP, niche, prices, channel results), idea-namespaced.
- [x] D2. Episodic store (timestamped run events/outcomes/metrics).
- [x] D3. Procedural store = the versioned stage spec itself (what the meta-loop edits).
- [x] D4. On idea intake, clone generic procedural spec into the idea namespace; specialize via
       semantic/episodic accumulation; namespacing prevents cross-idea contamination.

## Phase E — Self-improving meta-loop (outer evaluator-optimizer), human-gated first
- [x] E1. Evaluator: after a run/stage, score outcomes against explicit criteria; diagnose the
       constraining stage.
- [x] E2. Reflection (Reflexion-style): write verbal lessons to episodic memory, prepended on
       re-run of affected stages.
- [x] E3. Improver: propose process changes as DIFFS to the versioned spec (new checklist item,
       revised gate threshold, new stage) with rationale + version bump.
- [x] E4. Guardrails: archive every spec version; regression-gate changes against past
       idea-runs/eval cases before acceptance; human approval required initially; rollback.
- [x] E5. Anti-objective-hacking: success metrics/evaluator are HIDDEN from and UNMODIFIABLE by
       the improver; true-outcome metrics (paying customers, LTGP:CAC) not proxies (lead counts).
- [x] E6. Re-run ONLY the phases that received enhancements (cascade), reusing existing
       decision/cascade machinery.

## Phase F — Specification document (human-reviewable alongside code)
- [x] F1. Write SPEC.md: every stage, gate, checklist item, deliverable, verification, the
       memory architecture, and the meta-loop design + guardrails — generated to match the code.
- [x] F2. Keep SPEC.md and the seed schema in sync (spec derived from the data records).

## Cross-cutting
- [x] X1. Typecheck clean after every phase; unit-test deterministic logic (gate evaluator,
       cascade, schema load/version, memory namespacing).
- [x] X2. Never overwrite operator .env / memory / context. Snapshot before risky changes.
- [x] X3. Rebuild zip + present after each phase so the operator always has the latest.

## Progress log
- (start) Plan laid down. Framework healthy, typecheck clean. Beginning Phase A.
- Phase A DONE: schema types (loop-schema.ts), safe gate evaluator (gate-eval.ts, fully tested incl. injection-safety), 10-stage marketing-woven seed (loop-seed.ts), versioned disk store + append-only archive + rollback (loop-spec-store.ts). All unit-tested. C1/C3 (marketing stages + WTP-after-demand) folded in. Next: Phase B executor.

- Phases B,D,E,F DONE: executor (loop-executor.ts + agents/loop/run-stage.ts), three-layer memory (loop-memory.ts), self-improving meta-loop with hidden evaluator + regression gate + archive/rollback (meta-loop.ts), spec-doc generator (spec-doc.ts), CLI wired (idea/meta/spec-doc). All guardrails + control-flow unit-tested. Objective-hacking rejection verified.
