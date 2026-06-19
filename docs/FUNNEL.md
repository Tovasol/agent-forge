# Funnel & CRM

Lead capture is phase one of a funnel, not the whole thing. Here's how the pieces fit and how the agent decides what to use.

## The funnel shape (starting point)

```
  Visitor
    │  hero + lead-magnet offer (the 23-point pipeline audit checklist)
    ▼
  Capture form  ──POST /api/lead──►  Cloudflare Worker
    │                                   │ append row
    ▼                                   ▼
  Thank-you page                    CRM (Google Sheets → optional D1)
    │  "book a discovery call" CTA       │
    ▼                                   ▼
  Calendar booking                  Confirmation + nurture email (ESP)
    │
    ▼
  Discovery call → work order → you fulfill
```

## CRM: start on Sheets, upgrade only if earned

The starter uses a **Google Sheets CRM** because it's zero-infra, lives in the Workspace you already have, and is trivially editable by hand — perfect while volume is low. The Worker appends `[timestamp, email, source, country, user-agent]` to a `Leads` tab.

An optional **Cloudflare D1** store is included as a fallback / upgrade for when you want querying, stages, and joins (`worker/schema.sql` has a `leads` table with a `stage` column: new → nurturing → qualified → customer → lost).

During the **decide** phase, the agent explicitly evaluates whether a dedicated CRM is worth it for your projected volume and budget — scoring options on cost, fit with Workspace/Cloudflare, integration effort, and headroom. It will only recommend moving off Sheets if the evidence and your volume justify it, and that recommendation (since it usually involves spend) routes through a gate. You're never silently upgraded into a paid tool.

## Email / ESP

The confirmation + nurture email is a decision the agent makes in the decide phase (frugal options that play well with Workspace and Cloudflare Workers, scored on deliverability, free-tier fit, and integration effort). The Worker has a clearly marked hook (`EMAIL_PROVIDER_KEY` + a TODO in `handleLead`) the builder wires to the chosen provider.

## Setting up the Sheets CRM (manual, ~5 min)

1. Create a Google Sheet with a tab named `Leads` and headers in row 1: `ts | email | source | country | ua`.
2. In Google Cloud, create a **service account**, enable the Sheets API, and download its JSON key.
3. Share the sheet with the service account's email (as Editor).
4. Set in `.env` / Wrangler secrets:
   - `GOOGLE_SHEETS_CRM_ID` (the sheet id from its URL)
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (path to the key) — or, for the Worker, `wrangler secret put GOOGLE_SA_EMAIL` and `GOOGLE_SA_KEY`.

If these aren't set, the Worker logs leads (so none are lost) and the agent will emit setup steps instead of failing.

## Conversion optimization

Once live, drop any analytics export into `memory/metrics/` and run `npm run optimize`. The optimizer forms one falsifiable hypothesis (e.g. CTA wording, offer framing, form length), names the metric, and defines the win threshold — preferring zero-cost copy/layout changes before anything that spends money.
