# BUILD PROGRESS

This file tracks what's been built into Agent Forge across sessions, so any future session (yours or the assistant's) can see the state at a glance.

## Status: venture engine complete ✓

### Layers built
1. **Core pipeline** (`research → decide → build → deploy → optimize`)
   - Orchestrator + parallel research workers + critic loops
   - Weighted decision artifacts, gated deploy, optimization proposals
   - Files: `src/agents/{research,decide,build,deploy,optimize}.ts`, `src/harness/{loop,memory,gates,budget}.ts`

2. **Growth engine** (the "always has work" loop)
   - Scored backlog (RICE/ICE) across content/LinkedIn/cold-email/community/foundational
   - Automate-vs-gate policy enforced in code (`channel-policy.ts` + `enforceGate()`)
   - Planner, channel preparers, approval queue, attribution feedback, scheduler
   - Files: `src/agents/{grow,approvals,attribution}.ts`, `src/harness/{backlog,scorer,scheduler,seed-backlog}.ts`, `src/lib/{growth-types,channel-policy}.ts`

3. **Venture engine** (idea → live business)  ← newest
   - 9-stage pipeline encoded from Blank/Ries/Aulet/Fitzpatrick/Christensen
   - Stage runner loads playbook **skills**; orchestrator drives with gates + resumability
   - Decision briefs at forks (base rates, reversibility, pre-mortem, calibrated recommendation)
   - Gates only at strategic/money/identity/legal/contact/taste; everything else autonomous
   - Multi-session persistent state + human-readable journal
   - Files: `src/agents/venture/{launch,orchestrator,stage}.ts`, `src/harness/{venture-state,venture-gates}.ts`, `src/lib/{venture-types,stages}.ts`, `skills/*.md`, `prompts/{stage-runner,decision-brief}.md`

4. **Operator context intake** (resumes + assets → profile)
   - Reads PDF/DOCX/TXT/MD from `context/` (pdf-parse, mammoth)
   - Deterministic asset→capability map + LLM profiler; threaded into every stage
   - Files: `src/agents/venture/profile.ts`, `src/harness/context-loader.ts`, `src/lib/{operator-types,asset-capabilities}.ts`, `prompts/operator-profiler.md`, `context/`

5. **Capability requirements ledger** (needs-first)  ← newest
   - Derives what success REQUIRES from the plan, independent of what's owned
   - Marks each need satisfied (owned asset) or gap (with informed options + recommended default)
   - Money/identity/legal gaps become gates; runs automatically before the build stage
   - Files: `src/lib/requirements.ts`, `src/agents/venture/requirements.ts`, `prompts/needs-analyst.md`

### Verified
- Full TypeScript typecheck clean
- Gate-classification unit tests pass (named-contact/spend/3rd-party-post all gate; own-property prep auto)
- Venture state-machine tests pass (stage order, gate placement, firing/clearing, resume-from-first-incomplete)
- Asset→capability map tests pass; real PDF + DOCX + TXT extraction verified end-to-end
- CLI surface works: status/doctor/backlog/approvals/attribution/venture status/venture profile all run

### Resilience (added after first live run)
- `runAgent` retries transient SDK crashes (process-exit-1, rate trips) with backoff (3x)
- Research fan-out uses `Promise.allSettled` — one worker failing no longer aborts the run
- Completed workers checkpoint to disk; a crashed run resumes and skips finished workers
- Default research concurrency: 2 on subscription auth, 4 on apikey (rate-sensitivity)

### Known follow-ups (not yet built)- Cloudflare Cron Trigger Worker to run `grow` on a schedule in your own infra
- An n8n funnel-plumbing handoff (optional, if you adopt n8n for integrations)
- Real ESP wiring in the build phase (currently a clearly-marked hook)
- The SDK version in `package.json` is a placeholder `^0.1.0` — pin the current one (`npm view @anthropic-ai/claude-agent-sdk version`)

### How to verify a fresh checkout
```bash
npm install
npm run doctor
npx tsc -p tsconfig.json --noEmit   # should be clean
npm run venture:status              # should say "No venture yet"
```
