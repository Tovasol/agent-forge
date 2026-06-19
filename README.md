# Agent Forge

A persistent, self-correcting agent system on top of Claude that takes a **hint of a business idea** and drives it toward a **live service business** — picking the niche and business model (you approve), researching every decision before making it, building and deploying, and running a self-optimizing growth loop. It owns the *process*; you own only the handful of irreducible human actions (approve direction, pay, register, configure, send, choose taste).

It is **not** a "press go and get rich" machine — and the honest framing matters, so read [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md) and the honesty section of [`docs/VENTURE.md`](docs/VENTURE.md) first. It improves your odds by running the full venture-building playbook well and keeping your downside inside an affordable-loss ceiling you set; it cannot guarantee the outcome.

## Fastest start: the venture engine

```bash
npm install
cp .env.example .env                 # default auth = your Claude Code subscription
npm run venture -- launch "something with data pipelines"
```

It sets an affordable-loss ceiling, then drives the pipeline (idea → niche → model → offer → validation → GTM → build → launch), stopping only when it needs you. Check in with `npm run venture:status`, approve with `npm run venture:gates`, continue with `npm run venture:resume`. State persists across sessions in `memory/venture/`. Full detail in [`docs/VENTURE.md`](docs/VENTURE.md).

The lower-level pipeline below still exists and is reused by the venture engine's later stages.

---

---

## What it actually does

| Phase | What the agent does | Human gate? |
|------|----------------------|-------------|
| **research** | Lead orchestrator plans 3–5 parallel research workers (market/ICP, competitor copy, lead-magnet formats, frugal service stack, funnel/conversion). Each returns **cited** findings. A critic loop sends thin work back. | no (auto) |
| **decide** | Turns findings into **weighted, scored decision tables** (ESP, CRM, DB, hosting, analytics, positioning, lead magnet). Every option carries evidence + real monthly cost. Critic-gated. | no (auto) |
| **build** | Builder agent implements the React + Cloudflare site **one feature at a time**, verifying each before marking it done (long-running-harness pattern). | no (auto) |
| **deploy** | Ships to Cloudflare via Wrangler — or prints an exact runbook if creds aren't set. | **YES** |
| **optimize** | Reads whatever analytics/CRM signal exists, proposes **one** falsifiable change, defines the success metric. | only if it costs money |

Default autonomy is **`gated`**: it runs research → decide → build freely, and stops for your approval only at **spend** and **deploy**.

## The growth agent (the "always has work" loop)

Once the site is live, the framework doesn't sit idle waiting for traffic. The **growth agent** maintains a standing, scored backlog of launch work across five channels and, every run, does the single highest-value unit it can — drafting content, researching prospects, refining your ICP, preparing posts — while **never** auto-executing anything that contacts a named person or spends money. Those get prepared and parked in an approval queue for you.

```bash
npm run grow          # do ONE unit of the highest-value growth work now
npm run backlog       # see the scored backlog (and what's gated 🔒 vs auto ⚙)
npm run approvals     # review/approve what the agent prepared for named-contact/spend
npm run attribution   # feed booked-calls back so it shifts toward what works
npm run watch         # run on a cadence (default hourly), parks cleanly at gates
```

The automate-vs-gate line is **enforced in code** (`src/lib/channel-policy.ts` + `enforceGate()` in `src/agents/grow.ts`), grounded in real platform ToS and email law: LinkedIn/Reddit/HN/Slack are draft-only (their ToS ban automation), cold-email *sends* are gated (Gmail bulk-sender rules + CAN-SPAM/GDPR), and content can publish to your own site only after your accuracy review (Google's scaled-content-abuse policy). Full detail in [`docs/GROWTH.md`](docs/GROWTH.md).

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#   - FORGE_AUTH=subscription  (uses your Claude Code login; start here)
#   - edit config/brief.json with your business specifics

# 3. Sanity check
npm run doctor

# 4. Run the whole loop (stops at spend/deploy gates)
npm run all

#    …or step by step:
npm run research
npm run decide
npm run site        # build phase
npm run deploy      # gated
npm run optimize
```

Check progress anytime:

```bash
npm run status          # machine status
cat memory/progress.md  # human-readable log + pending gates
```

If the loop pauses at a gate in a non-interactive shell, decide, then:

```bash
npm run resume
```

---

## Auth: subscription vs API key

You asked to start on your **Claude Code subscription** — that's the default (`FORGE_AUTH=subscription`). The runtime uses your existing `claude` login on this machine.

There's one important caveat worth knowing: the **documented, policy-safe** path for *automated* loops is a pay-as-you-go **API key**. Subscription auth is intended for interactive/personal use, and Anthropic's rules here have changed repeatedly. For a long unattended run, or if you start hitting limits, flip:

```bash
FORGE_AUTH=apikey
ANTHROPIC_API_KEY=sk-ant-...
```

The framework supports both via that single env switch — nothing else changes. (Note: if `ANTHROPIC_API_KEY` is set in your shell, the underlying runtime will prefer it; to force subscription auth, leave it empty.)

---

## How persistence actually works

The thing that makes this more than a chatbot is the **harness**, not the prompts:

- **`memory/state.json` + `memory/progress.md`** — every phase writes what it did and what's next, so a fresh process resumes cleanly.
- **`memory/findings/*.json`** and **`memory/decisions/*.json`** — durable, cited artifacts you can inspect and edit.
- **Critic / evaluator loops** — research and decisions get sent back (up to 2×) if evidence is thin or a cheaper option was missed.
- **Feature checklist** (`site/scaffold/forge-features.json`) — the builder works one feature at a time and only marks `passes:true` after verifying, so it can't "declare victory early."
- **Budget + turn caps** — hard ceilings (`FORGE_MAX_BUDGET_USD`, `FORGE_MAX_TURNS`) prevent runaway loops.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.

---

## Deeper research (optional)

Native Claude WebSearch/WebFetch is the default and needs no extra keys. To unlock heavier scraping (competitor pages, JS-rendered sites), drop any of these into `.env` and the agent will use them automatically: `FIRECRAWL_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`.

---

## The funnel & CRM

Lead capture is phase one; the funnel is built around it. The starter Worker (`site/scaffold/worker/index.ts`) captures leads and appends them to a **Google Sheets CRM** (zero infra) out of the box, with an optional **Cloudflare D1** fallback. During the **decide** phase the agent evaluates whether a more capable CRM is worth it for your volume and budget, and will recommend (and justify) an upgrade only if the evidence supports it. See [`docs/FUNNEL.md`](docs/FUNNEL.md).

---

## Layout

```
src/
  cli.ts                 # forge CLI
  lib/                   # config, agent SDK wrapper, prompts, types, utils
  harness/               # memory, gates, budget, master loop
  agents/                # research, decide, build, deploy, optimize
prompts/                 # system prompts (the actual "intelligence")
site/scaffold/           # React + Cloudflare lead-magnet starter the builder grows
memory/                  # durable state, findings, decisions, metrics
config/brief.json        # your business brief
docs/                    # CAPABILITIES, ARCHITECTURE, FUNNEL
```
