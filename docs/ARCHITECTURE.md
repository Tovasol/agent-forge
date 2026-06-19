# Architecture

The design follows three patterns from Anthropic's own engineering practice: the **orchestrator–worker** multi-agent research system, the **evaluator–optimizer** (critic) loop, and the **long-running harness** (durable progress files + feature checklist) that lets an agent persist across many context windows.

## The loop

```
                ┌──────────────────────────────────────────────┐
                │                  forge CLI                    │
                │   run --phase <research|decide|build|deploy|  │
                │        optimize|all>  /  resume / status      │
                └───────────────────────┬──────────────────────┘
                                        │
                              harness/loop.ts
                 (chains phases, inserts human gates by autonomy)
                                        │
     ┌──────────────┬──────────────┬────┴───────┬──────────────┬───────────────┐
     ▼              ▼              ▼            ▼              ▼               ▼
 research        decide          build       deploy        optimize       (gates)
 orchestrator    decision        builder     wrangler      optimizer      spend/deploy
 + N workers     tables          agent       (gated)       proposals      → human
 + critic        + critic        + checklist
     │              │              │            │              │
     └──────────────┴──────────────┴────────────┴──────────────┘
                                        │
                                  harness/memory.ts
                    state.json · progress.md · findings/* · decisions/*
```

## Why each piece exists

### Orchestrator → parallel workers (research)
A single agent researching everything serially is slow and shallow. The lead **decomposes** the goal into 3–5 narrow facets and runs them in parallel, each worker with its own context window and a strict cited-JSON output contract. This mirrors Anthropic's finding that an orchestrator with specialized subagents substantially outperforms a single agent on research — at the cost of more tokens, which is why effort is scaled to the task and workers default to the cheaper model.

### Critic / evaluator loop (research + decide)
After workers report, a **critic** scores the output for citation quality, coverage, cost realism, and stack fit. `verdict: "revise"` sends sharpened objectives back through (up to 2×). This is the single biggest defense against "confident but unsourced," which is what makes a normal chatbot feel untrustworthy for real decisions.

### Weighted decision artifacts (decide)
Decisions aren't prose. Each is a JSON object: criteria + weights, options scored 0–1 per criterion, real monthly cost, evidence URLs, a recommendation, and `requiresSpend`/`reversible` flags the harness uses to decide whether to gate. You can open any decision file and override it.

### Long-running harness (build)
The builder reads `progress.md` + `forge-features.json`, works **one feature at a time**, verifies (build/typecheck), commits, and only then flips `passes:true`. The strongly-worded "don't delete tests/features to pass" rule and the explicit checklist are what stop an agent from declaring victory early or one-shotting itself into an incoherent half-build.

### Gates (deploy + spend)
`harness/gates.ts` blocks before anything irreversible. In an interactive terminal it asks y/N. In a non-interactive shell it records the pending gate to state and exits, so you review `progress.md` and run `resume`. Autonomy modes:
- `gated` (default): auto through research→decide→build; stop at spend/deploy.
- `phased`: stop at every phase boundary.
- `research-only`: stop after decide.

### Durable memory (everywhere)
Everything important is a file. That's deliberate: it makes the agent restartable, its reasoning auditable, and its outputs editable by you. There are no hidden in-memory state machines to lose on a crash.

## Auth wrapper
`lib/agent.ts` flips between subscription OAuth and an API key based on `FORGE_AUTH`, attaches research MCP servers if their keys are present, enforces `maxTurns`/`maxBudgetUsd`, and parses JSON out of agent output. Swapping auth is one env var; no code changes.

## Extending it
- **Add a research facet:** the orchestrator will generate it from the brief, or hard-code a worker spec.
- **Add a connector:** drop its key in `.env`; `buildResearchMcpServers` wires it.
- **Add a phase:** implement `src/agents/<phase>.ts`, register it in `harness/loop.ts` and `PHASE_ORDER`.
- **Add durable orchestration:** the file harness is enough for one operator; if you want true workflow-engine durability (retries, idempotency, replay), wrap the loop in Temporal/Restate or a LangGraph checkpointer.
