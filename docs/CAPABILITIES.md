# Capabilities & honest limits

Read this once. It's the difference between this tool being useful and being a disappointment.

## What this framework genuinely does well

- **Deep, cited market research** across the facets that actually move revenue, run in parallel and checked by a critic for thin or unsourced claims.
- **Grounded decisions** — weighted rubrics, real cost-at-volume math, evidence per option — instead of vibes. You get inspectable JSON you can override.
- **Scaffolding and building** a real React + Cloudflare lead-magnet site with a working capture → CRM → email funnel, feature by feature, with verification.
- **Gated deployment** to your Cloudflare account.
- **A disciplined optimization loop** that proposes one falsifiable change at a time and tells you how to measure it.
- **Persistence** across crashes/restarts and across model context windows, via durable file-based state.

## What it does NOT do (and no agent loop honestly can)

- **It does not guarantee revenue.** It builds the machine and optimizes it on evidence; the market decides. "Create a money-making enterprise" is a goal you steer toward, not a button.
- **It does not make irreversible or money-spending decisions for you.** Domain purchases, paid tool signups, ad spend, and production deploys are **always** gated to a human.
- **It does not run forever unattended.** Each invocation does a bounded unit of work and stops — by design, so cost and behavior stay legible. You (or a cron you add) drive the cadence.
- **It is not a substitute for your judgment** on the offer, pricing, and fulfillment. You fulfill the work orders; the agent can't do the consulting for you.
- **It can be wrong.** Research can surface stale prices or miss a better option; the critic reduces this but doesn't eliminate it. Treat decision files as strong drafts, not gospel — they're JSON precisely so you can edit them.

## Cost expectations

- Under **subscription** auth, runs draw from your plan's usage limits — heavy multi-agent research can consume them quickly.
- Under **apikey** auth, a full research+decide pass typically lands in the low tens of dollars; the build phase is the larger, more variable cost. The `FORGE_MAX_BUDGET_USD` cap aborts runaway runs (apikey mode).
- Levers to spend less: lower `FORGE_MAX_PARALLEL_WORKERS`, keep workers on the cheaper model (default), run phases individually, and reuse saved findings instead of re-researching.

## Policy note

Driving an automated agent loop with subscription credentials is allowed for personal local use today, but Anthropic's terms here have shifted repeatedly. For sustained or unattended automation, the clean path is a pay-as-you-go API key (`FORGE_AUTH=apikey`). Verify current terms at support.claude.com before scaling up.
