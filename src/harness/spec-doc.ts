// src/harness/spec-doc.ts
// Generates a human-readable specification document directly from the live loop
// spec (the data records) + the meta-loop's protected invariants. Because it is
// derived from the same data the executor runs, the doc can never silently drift
// from the implementation. Run via `forge spec-doc`.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { LoopSpec } from "../lib/loop-schema.js";
import { loadSpec } from "./loop-spec-store.js";

export function renderSpecDoc(spec: LoopSpec): string {
  const L: string[] = [];
  L.push(`# Codified Idea-to-Profitability Loop — Specification`);
  L.push(``);
  L.push(`> Generated from the live spec (v${spec.specVersion}, updated ${spec.updatedAt}).`);
  L.push(`> This document is derived from the same data records the executor runs, so it stays in sync with the code.`);
  L.push(``);
  L.push(`Last change: ${spec.changeNote}`);
  L.push(``);
  L.push(`## How it works`);
  L.push(``);
  L.push(`An idea is walked through the stages below in order. Each stage has a checklist the agent completes to concrete deliverables; each item is tagged \`live\` (needs current market data), \`internal\` (reasoning), or \`mixed\`. A stage advances only when its **gate predicate** evaluates true over the idea's typed metrics bag — and, where marked, only after the **operator** supplies real-world evidence (a human gate). Gates can advance, **pivot** back to a named upstream stage, or **kill** the idea. The framework owns the process, not the outcome: a fast, honest kill is a valid success.`);
  L.push(``);
  L.push(`The whole framework is **data, not code**: stages, checklists, and gates are versioned records the self-improving meta-loop can rewrite (see "Meta-loop & guardrails"). Marketing is woven throughout — willingness-to-pay is validated only **after** a marketing engine produces qualified demand.`);
  L.push(``);
  L.push(`## Stage sequence`);
  L.push(``);
  L.push(spec.stages.slice().sort((a,b)=>a.order-b.order).map((s) => `${s.order}. **${s.title}**${s.marketing ? " _(marketing)_" : ""}`).join("\n"));
  L.push(``);

  for (const s of spec.stages.slice().sort((a, b) => a.order - b.order)) {
    L.push(`---`);
    L.push(``);
    L.push(`### Stage ${s.order}: ${s.title}  \`#${s.id}\` (v${s.version})`);
    L.push(``);
    L.push(`**Intent:** ${s.intent}`);
    L.push(``);
    L.push(`**Why this stage:** ${s.rationale}`);
    L.push(``);
    if (s.dependencies.length) L.push(`**Depends on:** ${s.dependencies.join(", ")}`);
    L.push(`**Inputs:** ${s.inputs.join("; ")}`);
    L.push(``);
    L.push(`**Checklist:**`);
    L.push(``);
    L.push(`| # | Item | Data | Deliverable | Verification |`);
    L.push(`|---|------|------|-------------|--------------|`);
    s.checklist.forEach((c, i) => {
      const human = c.humanOnly ? " 🧑‍💼" : "";
      L.push(`| ${i + 1} | ${c.text}${human} | \`${c.dataNeed}\` | ${c.deliverable} | ${c.verification} |`);
    });
    L.push(``);
    L.push(`**Gate**`);
    L.push(``);
    L.push(`- Predicate: \`${s.gate.predicate}\``);
    L.push(`- Advance when: ${s.gate.advance}`);
    L.push(`- Pivot: ${s.gate.pivot.when} → back to \`${s.gate.pivot.toStage}\``);
    L.push(`- Kill: ${s.gate.kill}`);
    L.push(`- Human gate: ${s.gate.human === "none" ? "none" : `**${s.gate.human}** (operator must approve/provide evidence)`}`);
    L.push(``);
    L.push(`**Encodes:** ${s.sources.join("; ")}`);
    L.push(``);
  }

  L.push(`---`);
  L.push(``);
  L.push(`## Memory architecture`);
  L.push(``);
  L.push(`Per idea, namespaced under \`memory/loop/ideas/<id>/\`:`);
  L.push(``);
  L.push(`- **Semantic** (\`semantic.json\`): durable facts about this idea (ICP, niche, prices, channel results) and the typed **metrics bag** that gate predicates read.`);
  L.push(`- **Episodic** (\`episodic.jsonl\`): append-only timestamped events, metrics, verdicts, and **lessons** (Reflexion-style) prepended on re-runs of a stage.`);
  L.push(`- **Procedural** (\`spec.json\`): this idea's clone of the versioned loop spec — the process itself, which the meta-loop can evolve.`);
  L.push(``);
  L.push(`On intake, the generic spec is cloned into the idea's namespace; the idea then specializes via accumulating semantic/episodic memory. Namespacing prevents cross-idea contamination.`);
  L.push(``);
  L.push(`## Meta-loop & guardrails`);
  L.push(``);
  L.push(`An outer evaluator-optimizer loop improves the framework over time: it scores each idea-run with a **protected, code-resident objective** (rewarding honest progress to payment/profit and honest early kills — never proxy activity), writes verbal **lessons** to memory, and proposes **process changes** (new checklist items, tightened gates) as structured diffs. Safety:`);
  L.push(``);
  L.push(`1. **Hidden, unmodifiable evaluator** — the success metric lives in code, not in the editable spec; the improver cannot see or alter what counts as success.`);
  L.push(`2. **Empirical regression gate** — a proposed change must pass structural validation **and** a suite of invariant scenarios (e.g. the WTP gate must still require real payment evidence; profit must still require default-alive) before it can be accepted. This is what catches objective-hacking.`);
  L.push(`3. **Archive + rollback** — every spec version is archived; any change is revertible (\`forge meta revert <v>\`).`);
  L.push(`4. **Human approval by default** — changes are proposed, not auto-applied, unless explicitly run with \`--auto\` (and even then the regression gate must pass).`);
  L.push(`5. **Re-run only what changed** — after a change, only the affected stages are re-run.`);
  L.push(``);
  L.push(`## Operator commands`);
  L.push(``);
  L.push("```");
  L.push(`forge idea new "<your idea>"        # instantiate the loop for an idea`);
  L.push(`forge idea new "<your idea>" --import  # ...and seed it from prior research/decisions in this folder`);
  L.push(`forge idea import <id>              # fold earlier findings/decisions into an existing idea`);
  L.push(`forge idea run <id>                 # walk it through stages until a gate needs you`);
  L.push(`forge idea status <id>              # see stage progress + metrics`);
  L.push(`forge idea metric <id> k=v ...      # record real-world evidence (e.g. paying_clients=3)`);
  L.push(`forge idea pivot <id> <stage>       # send it back to a stage; reopen downstream`);
  L.push(`forge idea kill <id> "<reason>"     # honest kill`);
  L.push(`forge meta improve [--auto]         # propose (or auto-apply) a framework improvement`);
  L.push(`forge meta versions | revert <v>    # framework version history / rollback`);
  L.push(`forge spec-doc                      # regenerate this document from the live spec`);
  L.push("```");
  L.push(``);
  L.push(`> The real test of this framework's correctness is the operator's actual profitability. The gates are honest by design — their value is in refusing to advance on unmet criteria, not in producing documents.`);
  L.push(``);
  return L.join("\n");
}

export function writeSpecDoc(): string {
  const spec = loadSpec();
  const md = renderSpecDoc(spec);
  const out = resolve(process.cwd(), "docs/LOOP_SPEC.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  return out;
}
