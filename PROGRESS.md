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

### Adaptive research fan-out (topic-driven, bounded)
- Planner SCOPES the venture then decides the facet count from the topic — NO fixed number
- Removed the old "3–5 workers" hardcode and the `maxParallelWorkers+1` cap (that cap caused the "only 3" behavior)
- Critic now reports `missingAreas[]`: entirely-missing decision-critical areas become NEW workers (real gap-closing fan-out), not just re-sharpened ones
- Bounded by `FORGE_MAX_RESEARCH_WORKERS` (ceiling, default 8) and `FORGE_MAX_RESEARCH_ROUNDS` (default 3) so it scales with complexity but can't run away
- Verified: simple topic stays small & stops early; complex topic grows; ceiling + round budget hard-stop a runaway

### Saturation-driven stopping + two-tier memory + synthesis
- Research now stops on SATURATION (no new decision-relevant info arriving), judged per-round by the critic (`saturated` + note) AND a deterministic novelty check (new distinct claims per round). Backstops (workers 12 / rounds 4) demoted to circuit breakers.
- Workers return DISTILLED findings — `implications` + `nextActions`, not raw dumps. Critic/synthesis receive compact projections, not full findings, so context stays bounded as research grows.
- Two-tier memory: raw source ledger (`memory/research/sources.json`) is DISK-ONLY and deduped — persists every cited source to avoid wasteful re-research, never enters the prompt context. Distilled tier = findings + synthesis.
- Synthesis step rolls all facets into `memory/research/synthesis.{json,md}` (keyFindings → conclusions → nextActions) — the artifact downstream stages consume.
- Verified: novelty detection flags zero-new-info rounds; round 0 never auto-saturates; source ledger dedups + persists to disk.

### Live visibility (dashboard + persistent logs + streaming activity)
- UNIVERSAL: feedback is baked into the agent runner, so EVERY phase (research, decide, build, deploy, optimize, all venture stages, growth) streams activity — not just research. Each call carries a `label` so activity is attributed to the right step.
- Heartbeat: a pulse every 5s with elapsed seconds + last action, so even a silent "thinking" phase visibly shows it's alive (no more frozen-looking terminal between log lines).
- Streaming tool activity: each search/fetch/file-write/thinking turn emits a live line (🔍/🌐/⚙/💭).
- Persistent disk logs: every run writes `memory/logs/latest.log` (+ timestamped per-run file). `tail -f memory/logs/latest.log` for a live feed.
- Status snapshot: `memory/status.json` tracks current phase, the research fan-out tree (facet state/searches/claims), spend, and recent activity. Facets clear on phase change.
- Live dashboard: `npm run dash` renders the fan-out tree (research) or a Working spinner + heartbeat (other phases), with streaming activity, redrawing each second. Decoupled from the engine — run in a second terminal, attach/detach anytime; flags "no update >90s".
- Verified: status round-trips; dashboard renders for research AND non-research phases; phase transitions clear stale facets; logs persist.

### Known follow-ups (not yet built)
- Cloudflare Cron Trigger Worker to run `grow` on a schedule in your own infra
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
