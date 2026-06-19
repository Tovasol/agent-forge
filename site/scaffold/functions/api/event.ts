// Cloudflare Pages Function — first-party conversion event beacon.
// Route: POST /api/event
//
// Receives funnel milestone events from src/analytics.ts (scorecard_started,
// lead_captured, booking_completed, …). At launch this simply logs to the
// Cloudflare request log at $0 so the operator has conversion visibility; it is
// forward-compatible with forwarding to Plausible / a D1 table later.

export interface Env {
  // Optional: when added, forward server-side to Plausible (Business tier).
  PLAUSIBLE_DOMAIN?: string;
}

interface EventBody {
  event?: string;
  props?: Record<string, unknown>;
  ts?: number;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request } = context;
  let body: EventBody = {};
  try {
    body = (await request.json()) as EventBody;
  } catch {
    /* tolerate empty/bad bodies — beacons should never error noisily */
  }

  const event = String(body.event ?? "unknown").slice(0, 60);
  const record = {
    event,
    props: body.props && typeof body.props === "object" ? body.props : {},
    ts: typeof body.ts === "number" ? body.ts : Date.now(),
    country: (request as unknown as { cf?: { country?: string } }).cf?.country ?? "",
  };

  // $0 visibility: structured log line, greppable in `wrangler pages deployment tail`.
  console.log("EVENT", JSON.stringify(record));

  // 204: beacons don't need a body.
  return new Response(null, { status: 204 });
};

export const onRequestGet: PagesFunction<Env> = async () =>
  new Response(JSON.stringify({ ok: true, service: "pipelineforge-event-beacon" }), {
    headers: { "content-type": "application/json" },
  });
