// Analytics shim — staged per the analytics decision:
//   1) Cloudflare Web Analytics (cookieless) handles raw traffic via the beacon
//      script in index.html. No code needed here.
//   2) A lightweight first-party conversion beacon fires on funnel milestones
//      (scorecard start, email capture, booking opened/booked) so the
//      "iteratively optimize" loop has data at $0 — closing the live-site
//      "no conversion tracking" gap.
//   3) When traffic warrants, Plausible (Starter $9 / Business $39) can be added
//      by loading its script and setting window.plausible; track() will forward
//      to it automatically. No call-site changes required.
//
// Every call is wrapped so analytics can NEVER break the funnel.

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void;
  }
}

export type FunnelEvent =
  | "scorecard_started"
  | "scorecard_completed"
  | "lead_captured"
  | "results_viewed"
  | "booking_opened"
  | "booking_completed"
  | "cta_book_clicked";

/**
 * Record a funnel event. Sends a first-party beacon to /api/event (sendBeacon
 * so it survives navigation) and forwards to Plausible if present.
 */
export function track(event: FunnelEvent | string, props?: Record<string, unknown>): void {
  // Forward to Plausible if/when it's loaded.
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    /* never throw */
  }

  // First-party conversion beacon — works today on Cloudflare at $0.
  try {
    const payload = JSON.stringify({ event, props: props ?? {}, ts: Date.now() });
    const url = "/api/event";
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else if (typeof fetch !== "undefined") {
      void fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* analytics must never break the funnel */
  }
}
