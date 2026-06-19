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
- Log fidelity: tool-use detail (search queries, fetch URLs) is captured FULL in the log/terminal (was truncated to 80 chars). Dashboard is width/height-aware — uses the real terminal size, redraws on resize, and WORD-WRAPS long lines (URLs hard-split) instead of truncating. Fits exactly at ≥48 cols.
- Reasoning-phase feedback: tool-less phases (decide, optimize, synthesize, profile, requirements, venture stages) now announce an INTENT line up front, surface streamed reasoning snippets (and thinking blocks if present), and show a heartbeat with elapsed + turn count — so they're no longer a blank spinner. Dashboard's Working box shows the heartbeat note prominently.

### Idempotent, resumable, gap-filling research (across runs)
- The plan now PERSISTS (`memory/research/plan.json`). Re-runs reuse it, so facet ids stay stable and the checkpoint-skip matches — without this, re-planning would change ids and redo everything.
- Re-running research is idempotent: finished facets are skipped, only missing/interrupted ones run, then the critic fans out for any new gaps. Run it 2–3× to progressively fill gaps or recover from an interrupted run.
- Workers consult a compact "ALREADY ESTABLISHED" coverage digest (prior claims + source dates) and are told to fill gaps / refresh stale items rather than re-derive known facts.
- `npm run forge -- run --phase research --fresh` wipes prior plan/findings/sources for a clean restart. Normal runs always resume.
- Verified: plan persists with stable ids; interrupted re-run skips finished facet and runs only the rest; digest reflects prior findings; --fresh clears everything.

### Surviving plan usage limits (multi-day/week runs)
- When the plan usage limit is hit, the engine PAUSES instead of failing: detects the usage-limit error, parses the reset time when present (clock time / "in N hours" / ISO / epoch) or polls every FORGE_USAGE_POLL_MINUTES otherwise, sleeps with a live countdown, probes whether it's cleared, then RESUMES automatically. Checkpointed work isn't lost.
- Distinguishes usage-limit (wait) from auth/login errors (fail fast) and from transient crashes (3× retry). A generic repeated crash is probed in case a usage limit is hiding behind exit-1.
- Unbounded by default (FORGE_USAGE_MAX_WAIT_HOURS=0) so it can run for days/weeks; dashboard shows a ⏸ PAUSED banner with resume countdown.
- Verified: detection matches usage messages but not auth errors; reset parser handles clock/relative/ISO/epoch; pause banner + countdown render and clear on resume.

### Resume runs through to the end + interrupt-safe build
- `npm run resume` now continues from the first incomplete phase THROUGH all remaining phases in one invocation (was a bug: it ran only the next single phase and stopped). Completed phases are skipped, not redone. It still pauses at genuine human gates.
- Build is now resume-safe by INSPECTION (no manifest needed): on a re-run the builder reads the existing directory + forge-features.json, VERIFIES existing files are complete/valid (a file interrupted mid-write may exist but be truncated), and continues rather than restarting.
- Graceful Ctrl-C: the run catches SIGINT, prints a "run `npm run resume` to continue" hint, lets in-flight writes settle, and exits; a second Ctrl-C force-quits. Completed work is always checkpointed.
- Verified: resume-all runs the full remaining sequence and skips completed phases.

### Iterating after a full pass (`npm run iterate`)
- After a complete run (reached the optimize proposal), `npm run iterate` runs another IMPROVEMENT pass without losing progress: it re-opens decide→build→deploy→optimize (research stays as-is unless you pass `--deep`), injects the latest optimization proposal as guidance so the pass applies it, and relies on idempotency-by-inspection so each phase improves in place rather than rebuilding.
- `npm run iterate -- --deep` also re-opens research (resumes/refreshes/fills gaps).
- Guards: refuses to iterate until a full pass has completed (tells you to `npm run resume` first).
- Honest dependency: improvement quality scales with real signal (traffic/conversion data). With no new data a pass mostly confirms current state and re-proposes; feed metrics, then iterate.
- Verified: reopen keeps research + artifacts intact, removes the right phases, reads the latest proposal; guard fires on an incomplete run.

### Persistent operator decisions that re-align the plan (`npm run decision`)
- `npm run forge -- decision "<text>"` records a BINDING decision that (a) persists and is injected into every agent prompt from now on, and (b) cascades a redo of the earliest affected phase + everything downstream (the domino).
- Impact is auto-classified: positioning/audience/offer/marketing/strategy → `research` (whole chain redoes); option/tool/stack/funnel choice → `decide`; design/copy/page/visual → `build`. Override with `--from <phase>`.
- Examples: "site should have a professional, bright design" → build,deploy,optimize redo. "marketing should use Hormozi-style offers" → research re-PLANS (keeps sources as reference) and the entire chain re-aligns.
- Flags: `--apply` (rebuild immediately), `--from <phase>` (override impact), `--list`, `--clear [id]`.
- After a decision, run `npm run iterate` (or `--apply`) to rebuild in alignment. Decisions stack — every agent honors all active decisions.
- Verified: classifier maps both example decisions correctly; cascade = fromPhase + downstream; decisions persist to disk and inject into prompts; research-level decision triggers a re-plan.

### Unattended overnight self-improvement (`npm run overnight`)
- `npm run forge -- overnight [--hours 8] [--max-passes 12] [--deploy] [--spend-ceiling 0]` runs a bounded, unattended loop: ensure a full pass, then repeatedly BENCHMARK the built (and, if deployed, LIVE) site against successful competitors → queue improvement directives at the correct phase → cascade-rebuild from there → repeat, until budget runs out or convergence (2 clean passes).
- ADAPTIVE cascade: the benchmark routes each gap to the right stage — positioning/audience/market → research (full chain re-runs, research re-plans), offer/pricing/stack → decide, design/copy/cta/funnel/social-proof/performance → build. The deepest gap found in a pass sets how far back the redo cascades, so further research & new decisions DO happen when warranted — not just rebuilds.
- Live self-validation: the deploy phase auto-CAPTURES the live URL from wrangler's output (writes it to `memory/deploy/live-url.txt`, with a parse-from-report fallback), so the benchmark self-validates the deployed site automatically — no need to set FORGE_SITE_URL. The env var is now just an optional override (e.g. a custom domain). Each pass fetches the live site to confirm it loads and the capture form works; breakages become urgent build fixes.
- Gates don't freeze the night: deploy auto-approves only with --deploy; spends auto-approve only up to --spend-ceiling (default 0 = all spends deferred & recorded for you); identity/legal gates are skipped and deferred. Survives usage-limit pauses. Writes memory/MORNING.md.
- Honest scope: improves site QUALITY/conversion-readiness vs competitors; cannot produce leads overnight (needs real traffic).
- Verified: area→phase routing, deploy in/out of cascade, deepest-gap-wins, gate policy (deploy/spend/identity), convergence/maxPasses/deadline bounds.

### Git snapshots & rollback (safeguard against bad autonomous passes)
- The engine auto-commits durable progress (site/scaffold + valuable memory: findings, decisions, directives, research, benchmark, state) at milestones — after each phase, after deploy (marked good), and before/after every overnight pass.
- SECRET-SAFE: it guarantees `.env` (and friends) are git-ignored before any commit — verified it never commits secrets. Transient noise (logs, status.json, steer) is excluded too.
- Works without prior git setup: inits a local repo if needed, uses a local committer identity, and degrades gracefully if git is absent (logs + continues; snapshots are a safety net, not a hard dependency).
- `npm run forge -- snapshots` lists restore points (★ marks the last known-good). `npm run forge -- rollback [--to <hash>]` restores site + memory to a snapshot (defaults to last-good); it first snapshots current state so rollback is itself reversible, then you re-deploy the restored version.
- Optional `FORGE_GIT_PUSH=true` pushes snapshots to a configured remote for off-machine backup (local-only by default).
- Verified end-to-end: secret protection, milestone commits, last-good tracking, and rollback restoring a deliberately-corrupted site.

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
