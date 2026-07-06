# The Growth Agent

This is the module that answers "what does the agent *do* when it's not waiting for metrics?" It maintains a **standing backlog** of growth work across five channels and, on every run, does the single highest-value unit of work it can do right now — drafting content, researching prospects, refining your ICP, preparing posts — while **never** auto-executing anything that contacts a named person or spends money.

## The core idea

A normal "optimize" loop is idle until traffic exists. The growth agent never is, because most launch work doesn't depend on traffic: positioning, content, SEO, list research, competitor monitoring, drafting outreach and posts. The agent always has a prioritized queue and always picks the best available action.

```
  planner ──keeps the backlog full & scored──►  backlog.json
                                                   │
                                          scorer (RICE/ICE)
                                                   │  picks best ACTIONABLE task
                                                   ▼
                                            channel preparer
                                          (does ONE unit of work)
                                                   │
                                          ┌────────┴─────────┐
                                   actionClass=execute   actionClass=gate
                                   (own property / prep)  (named contact / spend)
                                          │                   │
                                     mark done          approval queue ──► you approve ──► you execute
```

## Commands

```bash
npm run grow          # do ONE unit of the highest-value work now
npm run backlog       # show the scored backlog and what's gated
npm run approvals     # review/approve/reject anything the agent prepared that needs a human
npm run attribution   # feed booked-calls back in so the agent shifts toward what works
npm run watch         # run a cycle on a cadence (default every 60 min), parks at gates
```

`npm run watch -- --interval 120 --max-cycles 10` runs ten cycles two hours apart, then stops.

## The automate-vs-gate policy (enforced in code)

This is the heart of it, and it's deliberately conservative because the constraints are real platform ToS and email law — not preferences. The policy lives in `src/lib/channel-policy.ts` and is enforced in `src/agents/grow.ts` at the `enforceGate()` function, which **overrides** whatever the model claims: if a task contacts a named person, spends money, or targets LinkedIn/Reddit/HN/Slack/Discord, it goes to the approval queue, full stop.

| Channel | Agent does autonomously | Always gated to you | Why |
|---|---|---|---|
| **Foundational** | ICP research, competitor monitoring, drafting positioning | Final pivot decision, partner outreach, paid tools | Strategy is draftable; commitments are yours |
| **Content/SEO** | Draft articles, on-page SEO, publish to *your own* site | Publish without your accuracy review; paid syndication | Google's scaled-content-abuse policy + expert-audience credibility |
| **LinkedIn** | Draft posts, comments, DMs *in your voice* | Posting, connecting, messaging, scraping — all of it | LinkedIn User Agreement §8.2 bans automation; enforcement is aggressive |
| **Cold email** | Research prospects (public), build lists, write LIAs, draft sequences | **Sending** to any named recipient; buying domains/inboxes/lists | Gmail bulk-sender rules + CAN-SPAM/GDPR; the send contacts a person |
| **Communities** | Draft value-first answers and posts | Posting/commenting anywhere | Reddit/HN/Slack ban automated self-promo; trust is the point |

LinkedIn and communities are on a hard **never-auto-execute** list regardless of task. Content's gate is *quality*: the agent can publish to your own site, but only after you've reviewed technical accuracy and voice (this is what stops AI-slop from torching your credibility with engineers).

## What "one unit of work" produces

Each `grow` cycle writes a concrete artifact under `memory/growth/artifacts/` — a drafted article, an email sequence, a prospect list, an audit checklist, an SEO diff, drafted posts. Gated artifacts wait in the approval queue with a summary of exactly what you're approving. You review with `npm run approvals`, and **you** do the actual sending/posting — the framework never touches third-party platforms itself.

## How it learns

`npm run attribution` reads `memory/growth/calls.csv` (rows of `source,booked-calls` — e.g. `linkedin,3`). It maps sources to channels, computes each channel's share of booked discovery calls, and reweights backlog confidence toward what's actually working. Add the simplest possible signal — the answers to "how did you hear about us?" on your booking form — and the agent shifts effort toward the channels booking calls.

## Honest expectations

For a high-trust technical service, **your** credibility books the calls. The agent can do ~70–80% of the *hours* (research, drafting, scheduling, measurement), but the ~20% that creates relationships — showing up in communities, posting in your voice, sending the outreach, taking the call — is yours and can't be delegated without the brand feeling machine-generated. Realistic time to first qualified calls is roughly one to three months, driven mostly by founder-led content and community presence rather than cold outbound. The framework is built to make that 80% effortless and to keep the 20% firmly in your hands. See [docs/CAPABILITIES.md](CAPABILITIES.md).

## Scheduling it for real

`npm run watch` is fine for a always-on machine. For production cadence on your stack, run `npm run grow` from a scheduler:
- **cron** (a small always-on box): `0 9 * * * cd /path/to/agent-forge && npm run grow`
- **Cloudflare Cron Triggers**: call a Worker that triggers a `grow` run (see the research notes in [docs/ARCHITECTURE.md](ARCHITECTURE.md)). Keep runs idempotent and respect the budget cap.
