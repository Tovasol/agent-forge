// Cloudflare Worker — lead capture endpoint.
//
// Serves the static site and handles POST /api/lead:
//   1. validates the submission
//   2. appends a row to the CRM (Google Sheets via a service account, or D1
//      as a fallback if SHEETS isn't configured)
//   3. fires a confirmation email (via a provider chosen in the decide phase)
//
// The builder agent wires the concrete CRM/email per the approved decisions.
// This starter implements the Sheets path with clear TODOs for the rest.

export interface Env {
  // Bind these in wrangler.toml / dashboard:
  ASSETS: Fetcher; // static assets binding
  CRM_SHEET_ID?: string;
  GOOGLE_SA_EMAIL?: string;
  GOOGLE_SA_KEY?: string; // PEM private key (use a secret!)
  LEADS?: D1Database; // optional fallback store
  EMAIL_PROVIDER_KEY?: string; // optional, set in decide phase
}

interface LeadBody {
  email: string;
  source?: string;
  ts?: number;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/lead" && req.method === "POST") {
      return handleLead(req, env);
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }
    // Everything else: static assets.
    return env.ASSETS.fetch(req);
  },
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

  const lead = {
    email,
    source: body.source ?? "unknown",
    ts: body.ts ?? Date.now(),
    ua: req.headers.get("user-agent") ?? "",
    country: (req as any).cf?.country ?? "",
  };

  // 1) Persist. Prefer Sheets CRM; fall back to D1 if present.
  try {
    if (env.CRM_SHEET_ID && env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_KEY) {
      await appendToSheet(env, lead);
    } else if (env.LEADS) {
      await env.LEADS.prepare(
        "INSERT INTO leads (email, source, ts, ua, country) VALUES (?,?,?,?,?)"
      )
        .bind(lead.email, lead.source, lead.ts, lead.ua, lead.country)
        .run();
    } else {
      // No store configured yet — don't lose the lead; log loudly.
      console.log("LEAD (no store configured):", JSON.stringify(lead));
    }
  } catch (err) {
    console.error("CRM write failed:", err);
    // Still return success to the user; a failed CRM write shouldn't lose them
    // the asset. The builder should add a retry/queue per the decisions.
  }

  // 2) Confirmation email — wired in the decide/build phase.
  // TODO(builder): call the chosen ESP here with EMAIL_PROVIDER_KEY.

  return json({ ok: true });
}

// ── Google Sheets append via service-account JWT (no external deps) ──────────
async function appendToSheet(env: Env, lead: Record<string, unknown>) {
  const token = await getGoogleAccessToken(
    env.GOOGLE_SA_EMAIL!,
    env.GOOGLE_SA_KEY!,
    "https://www.googleapis.com/auth/spreadsheets"
  );
  const range = "Leads!A:E";
  const endpoint =
    `https://sheets.googleapis.com/v4/spreadsheets/${env.CRM_SHEET_ID}` +
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      values: [[lead.ts, lead.email, lead.source, lead.country, lead.ua]],
    }),
  });
  if (!res.ok) throw new Error(`sheets append ${res.status}: ${await res.text()}`);
}

// Mint a Google OAuth access token from a service account using RS256 JWT.
async function getGoogleAccessToken(saEmail: string, pemKey: string, scope: string): Promise<string> {
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
