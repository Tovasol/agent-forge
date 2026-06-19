// Cloudflare Pages Function — PipelineForge lead capture endpoint.
// Route: POST /api/lead
//
// 1. Validates the scorecard submission
// 2. Appends a row to the CRM (Google Sheets via a service account; falls back
//    to logging if Sheets isn't configured yet)
// 3. Fires a confirmation email via Resend (free tier → $20/mo Pro)
//
// All third-party credentials are Cloudflare Pages environment variables /
// secrets (set via the Pages dashboard or `wrangler pages secret put`).

export interface Env {
  // CRM — Google Sheets (preferred)
  CRM_SHEET_ID?: string;
  GOOGLE_SA_EMAIL?: string;
  GOOGLE_SA_KEY?: string; // PEM private key

  // Email — Resend
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

interface DimensionScore {
  id: string;
  label: string;
  percent: number;
}

interface ScorePayload {
  raw?: number;
  max?: number;
  percent?: number;
  tier?: string;
  dimensions?: DimensionScore[];
}

interface LeadBody {
  email: string;
  company?: string;
  source?: string;
  ts?: number;
  score?: ScorePayload;
  answers?: Record<string, number>;
}

interface Lead {
  email: string;
  company: string;
  source: string;
  ts: number;
  ua: string;
  country: string;
  percent: number;
  tier: string;
  dimensions: DimensionScore[];
  answers: Record<string, number>;
}

const TIER_LABELS: Record<string, string> = {
  "at-risk": "Pipeline at Risk",
  fragile: "Fragile but Holding",
  solid: "Solid Foundation",
};

// Pages Functions export: handle POST requests only
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  return handleLead(request, env);
};

// Also expose a health check on GET
export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ ok: true, service: "pipelineforge-lead-api" });
};

async function handleLead(req: Request, env: Env): Promise<Response> {
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "invalid email" }, 422);
  }

  const score = body.score ?? {};
  const lead: Lead = {
    email,
    company: (body.company || "").trim().slice(0, 200),
    source: (body.source ?? "unknown").slice(0, 60),
    ts: typeof body.ts === "number" ? body.ts : Date.now(),
    ua: (req.headers.get("user-agent") ?? "").slice(0, 300),
    country: ((req as unknown as { cf?: { country?: string } }).cf?.country) ?? "",
    percent: clampInt(score.percent, 0, 100),
    tier: (score.tier ?? "").slice(0, 20),
    dimensions: Array.isArray(score.dimensions) ? score.dimensions.slice(0, 10) : [],
    answers: body.answers && typeof body.answers === "object" ? body.answers : {},
  };

  // 1) Persist to Google Sheets (or log if not configured)
  try {
    if (env.CRM_SHEET_ID && env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_KEY) {
      await appendToSheet(env, lead);
    } else {
      // No store configured — log the lead so it's recoverable from logs
      console.log("LEAD (no store configured):", JSON.stringify(lead));
    }
  } catch (err) {
    console.error("CRM write failed:", err);
    // Never fail the user's request due to a CRM write failure
  }

  // 2) Confirmation email via Resend
  try {
    if (env.RESEND_API_KEY && env.RESEND_FROM) {
      await sendConfirmationEmail(env, lead);
    } else {
      console.log("EMAIL (Resend not configured) would go to:", lead.email);
    }
  } catch (err) {
    console.error("Confirmation email failed:", err);
  }

  return json({ ok: true });
}

// ── Resend confirmation email ─────────────────────────────────────────────────
async function sendConfirmationEmail(env: Env, lead: Lead): Promise<void> {
  const tierName = TIER_LABELS[lead.tier] ?? "your reliability tier";
  const { subject, html, text } = buildEmail(lead, tierName);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [lead.email],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${await res.text()}`);
  }
}

function buildEmail(
  lead: Lead,
  tierName: string
): { subject: string; html: string; text: string } {
  const dimsText = lead.dimensions.map((d) => `  • ${d.label}: ${d.percent}%`).join("\n");
  const dimsHtml = lead.dimensions
    .map(
      (d) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#444">${escapeHtml(d.label)}</td>` +
        `<td style="padding:4px 0;font-family:monospace">${d.percent}%</td></tr>`
    )
    .join("");

  const subject = `Your Pipeline Reliability Scorecard — ${tierName} (${lead.percent}/100)`;

  const text = [
    `Thanks for running the Pipeline Reliability Scorecard.`,
    ``,
    `Overall score: ${lead.percent}/100 — ${tierName}`,
    ``,
    `By dimension:`,
    dimsText,
    ``,
    `What this means and where to focus first is on your results page.`,
    lead.tier === "at-risk"
      ? `Your score puts you in the danger zone. If you'd like a focused 20-minute reliability call, just reply to this email.`
      : `Reply any time if you'd like to talk through your report.`,
    ``,
    `— PipelineForge`,
    `The pipeline your team can actually trust.`,
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111;line-height:1.5">
    <p style="font-family:monospace;color:#2f7a4d;letter-spacing:0.08em;font-size:12px">▚ PIPELINEFORGE</p>
    <h1 style="font-size:22px;margin:8px 0 4px">Your Pipeline Reliability Scorecard</h1>
    <p style="margin:0 0 20px;color:#555">Overall score: <strong>${lead.percent}/100</strong> — <strong>${escapeHtml(tierName)}</strong></p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">${dimsHtml}</table>
    <p style="color:#555">${
      lead.tier === "at-risk"
        ? "Your score puts you in the danger zone — failures get found late and trust is leaking. A focused fix would buy back the most trust, fastest."
        : "You've got real guardrails in place. The opportunity now is hardening the edges."
    }</p>
    <p style="color:#555">${
      lead.tier === "at-risk"
        ? "If you'd like a focused 20-minute reliability call, just reply to this email."
        : "Reply any time if you'd like to talk through your report."
    }</p>
    <hr style="border:0;border-top:1px solid #eee;margin:24px 0" />
    <p style="font-family:monospace;color:#999;font-size:12px">PipelineForge — the pipeline your team can actually trust.</p>
  </div>`;

  return { subject, html, text };
}

// ── Google Sheets append via service-account JWT (no external deps) ───────────
async function appendToSheet(env: Env, lead: Lead): Promise<void> {
  const token = await getGoogleAccessToken(
    env.GOOGLE_SA_EMAIL!,
    env.GOOGLE_SA_KEY!,
    "https://www.googleapis.com/auth/spreadsheets"
  );
  const range = "Leads!A:I";
  const endpoint =
    `https://sheets.googleapis.com/v4/spreadsheets/${env.CRM_SHEET_ID}` +
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      values: [
        [
          lead.ts,
          new Date(lead.ts).toISOString(),
          lead.email,
          lead.company,
          lead.source,
          lead.country,
          lead.percent,
          lead.tier,
          JSON.stringify(lead.dimensions),
        ],
      ],
    }),
  });
  if (!res.ok) throw new Error(`sheets append ${res.status}: ${await res.text()}`);
}

async function getGoogleAccessToken(
  saEmail: string,
  pemKey: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: saEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPkcs8(pemKey);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" +
      encodeURIComponent(jwt),
  });
  if (!res.ok) throw new Error(`google token ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function importPkcs8(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.min(max, Math.max(min, n));
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(b: Uint8Array): string {
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
