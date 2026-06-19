# Drop your context here

Put files in this folder and the engine reads them before planning your venture,
so it builds on what you actually have (effectuation: start from your means).

## What to add

- **Your resume(s) / CV** — `.pdf`, `.docx`, `.txt`, or `.md`.
  Name them with "resume" or "cv" in the filename (e.g. `jane-resume.pdf`).
  The engine extracts your skills, domains, experience, achievements, and the
  credibility signals a buyer would trust.

- **An assets file** — a plain `.txt` or `.md`, named with "assets" (e.g.
  `assets.txt`). List everything you already own or can use: tools, services,
  subscriptions, domains, audiences, accounts. See `assets.example.txt`.

The engine maps assets to capabilities automatically. For example:
- "Google Workspace" → Calendar booking page, Sheets CRM, Gmail, Docs, Forms, Meet
- "Cloudflare" → site hosting, lead-capture Worker, D1 database, DNS + email auth, cron
- "Stripe" → checkout + subscriptions
- "a domain" → brand home + professional email

Then it PREFERS those (they're free to you) when designing the funnel, picking
infrastructure, and planning go-to-market.

## Rebuild after changing files

```bash
npm run venture:context     # re-scan context/ and rebuild the profile
npm run venture:profile     # just show the current profile
```

Nothing here is sent anywhere except to the model as planning context. Don't put
secrets/passwords in these files — describe assets, don't paste credentials.
