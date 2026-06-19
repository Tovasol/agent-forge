# The Venture Engine (idea → live business)

This is the top layer you asked for: give it the smallest hint of an idea, and it drives the whole arc — picking the niche and business model (you approve), researching every fork before deciding, building and preparing the launch — stopping only when something genuinely requires you. It owns the *process*; you own the handful of irreducible human actions.

## One command to start

```bash
npm run venture -- launch "something with data pipelines"
```

It asks for one number — your **affordable-loss ceiling** (the most you're willing to lose on this attempt) — then starts driving. It runs autonomously and stops only at a gate.

```bash
npm run venture:status     # where the venture is in the pipeline
npm run venture:gates      # review/approve what needs you
npm run venture:resume     # continue after you've cleared gates
```

Everything persists to `memory/venture/` — so you can stop anytime and pick up exactly where you left off across as many sessions as it takes. The human-readable log lives at `memory/venture/journal.md`.

## Give it your context (resumes + assets)

The engine works far better when it knows what *you* bring. Drop files in the `context/` folder before launching:

- **Resumes / CVs** (`.pdf`, `.docx`, `.txt`, `.md`, named with "resume" or "cv") — it extracts your skills, domains, experience, achievements, and the credibility signals a buyer trusts, and uses them for founder-market-fit scoring when picking the niche.
- **An assets file** (`.txt`/`.md` named with "assets") — list what you already own. It maps assets to capabilities automatically and *prefers them* (they're free to you) when designing the funnel and choosing infrastructure. For example:
  - "Google Workspace" → Calendar booking page for discovery calls, Sheets CRM, Gmail, Docs, Forms, Meet
  - "Cloudflare" → site + lead-capture Worker hosting, D1 database, DNS + email auth, scheduled jobs, free analytics
  - "Stripe" → checkout + subscriptions; "a domain" → brand home + pro email; "LinkedIn presence" → founder distribution

```bash
npm run venture:context     # scan context/ and (re)build your operator profile
npm run venture:profile     # show the current profile
```

`context/README.md` and `context/assets.example.txt` explain the format. The profile is built automatically when you launch, and threaded into every stage — so the niche, offer, GTM, and build all lean on your real skills and the tools you already pay for. (Describe assets; don't paste passwords or secrets.)

## What success depends on (the requirements ledger)

The engine is **needs-first**: it figures out the capabilities your venture's success depends on by reasoning from the *plan* — as if you owned nothing — and only then checks each against what you have. Your assets fill checkmarks and save you time; they never shrink or reshape the list of what's actually required.

So the engine will proactively tell you things like "the site has to be hosted somewhere" and "if the funnel ends in a call, you need scheduling" — present informed options with rough cost and a recommended frugal default — and:
- if you already own something that fits (e.g. Cloudflare for hosting, Google Calendar for scheduling), it marks that need **✓ satisfied** and moves on;
- if you don't, it's a **◻ gap** with options for you to choose from, and anything that costs money or needs your identity/legal action becomes a gate.

```bash
npm run venture:requirements   # derive + show the capability checklist
```

Example output (operator owns Cloudflare + Google Workspace):

```
  ✓ Web hosting            — covered by Cloudflare
  ✓ Calendar scheduling    — covered by Google Workspace
  ✓ Lead store / CRM       — covered by Workspace Sheets
  ◻ Domain                 → Cloudflare Registrar★, Namecheap
  ◻ Email sending          → Resend/Postmark★, Cloudflare Email Routing
  ◻ Payments               → Stripe★, Lemon Squeezy
  ◻ Business entity        → LLC★, Sole proprietor (defer)
```

This runs automatically right before the build stage (so the plan, not your assets, drives the list), and the gaps that cost money or need you become gates with the option comparison pre-staged. You can also run it anytime to see the standing checklist.

## The pipeline (the encoded expertise)

The engine knows the methodology so you never have to tell it what to research. Each stage is drawn from established venture-building practice (Blank's Customer Development, Ries's Lean Startup, Aulet's 24 Steps, Fitzpatrick's Mom Test, Christensen's JTBD) and encoded as a stage with a goal, the questions to answer, the artifacts to produce, and exit criteria.

| # | Stage | What it does | Stops for you? |
|---|---|---|---|
| 0 | **intake** | Turns your hint + means into directions; sets the affordable-loss ceiling | — |
| 1 | **segmentation** | Researches and produces 6–12 market opportunities | — |
| 2 | **beachhead** | Scores them on a weighted matrix, recommends ONE niche + a decision brief | 🔶 **strategic** (you approve the niche) |
| 3 | **profile-tam** | End-user persona + bottom-up TAM | — |
| 4 | **jtbd-value** | The job the customer hires you for + quantified value | — |
| 5 | **model-offer** | Business model + productized offer + tiered pricing + decision brief | 🔶 **strategic** (you approve model/price) |
| 6 | **validation** | Drafts Mom-Test outreach + evidence log | 🔶 **contact** (you send to named people) |
| 7 | **gtm** | Lead-magnet → funnel → discovery-call plan; first-10-clients motion | — |
| 8 | **build** | Builds the buyable, deliverable offer (reuses the build pipeline) | money/deploy gates |
| 9 | **launch-growth** | Starts the self-optimizing growth backlog (reuses the growth engine) | spend/contact gates |

## Decision briefs — why choices beat chance

At every real fork, the engine produces a **decision brief** (`memory/venture/briefs/`) that researches *all* the options and projects their consequences, so your approval is informed rather than a coin flip. Each brief has, per option: evidence with sources, a reference-class **base rate** (how comparable businesses actually fare), projected 1–3 year consequences, risks, and a **reversibility** tag (Bezos one-way vs two-way doors). Plus a pre-mortem ("assume this failed in 2 years — why?") and a calibrated recommendation. Irreversible or strategic choices always escalate to you; cheap, reversible ones it just makes and tells you.

## What stops for you, and why

The engine gates exactly the things only you can or should do — and pre-stages everything so your action is essentially one click:

- **strategic** — the niche choice and the business-model/pricing choice (you steer direction)
- **money** — any spend (it prepares the cart + cost-benefit)
- **identity** — KYC, business registration, banking (must legally be you)
- **legal** — entity formation, contracts, tax (it drafts; you sign)
- **contact** — outreach to a named person (it drafts; you send from your account)
- **taste** — brand/name/voice (it offers options; you pick)

Everything between gates — research, scoring, drafting, planning, building artifacts — runs without you.

## The honest part (read this)

The engine **owns the process, not the outcome.** That distinction is deliberate and it's the difference between this being useful and being a trap. What it reliably improves: not skipping validation, grounding decisions in real evidence and base rates, avoiding the known failure modes (the #1 cause of startup failure is building something no one needs — exactly what the validation stage exists to prevent), and moving fast without being reckless. What it *cannot* do — and no system honestly can — is guarantee the business succeeds. Outcome depends on market timing, your fulfillment, and luck. Base rates are sobering: roughly half of new US businesses are gone within five years. The engine's job is to move you meaningfully up from chance by doing the work well and keeping your downside inside the affordable-loss ceiling you set. It will tell you the truth in its decision briefs rather than cheerlead.

So: think of it as a tireless, well-trained co-founder who runs the entire playbook and hands you a short, clear queue of "only you can do this" actions — not an oracle that prints money. Used that way, it's genuinely powerful.

## Multi-session by design

Long builds take many sessions. The engine is built for it: every stage checkpoints to disk, the journal records what happened, gates park cleanly, and `venture:resume` always continues from the first unfinished stage. Stop whenever; come back whenever.

## Cost

Under subscription auth, runs draw from your plan limits; the deep multi-stage research is the heavy part. Under API-key auth, set `FORGE_MAX_BUDGET_USD` — the engine tracks spend against your affordable-loss ceiling and aborts if it would blow past the cap. Run stages, stop, inspect, resume to control pace and cost.
