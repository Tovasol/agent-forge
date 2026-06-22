// Analytics shim — funnel events forward to self-hosted Plausible CE.
//   - Plausible CE (Community Edition) is the single source of truth. Its
//     ClickHouse store is ours to export anywhere later (independence achieved
//     without a separate first-party beacon).
//   - track() forwards every funnel milestone to window.plausible with multi-
//     touch UTM attribution attached. No call-site changes required.
//
// Every call is wrapped so analytics can NEVER break the funnel.

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void;
  }
}

export type FunnelEvent =
  | "scorecard_started"
  | "scorecard_question_answered"
  | "scorecard_completed"
  | "gate_viewed"
  | "lead_captured"
  | "lead_capture_failed"
  | "results_viewed"
  | "booking_opened"
  | "booking_completed"
  | "cta_book_clicked";

// ---------------------------------------------------------------------------
// Multi-touch UTM attribution
// ---------------------------------------------------------------------------
// Plausible records UTMs on the *pageview* automatically, but only for the
// current session and only as flat strings — it can't tell you the ordered
// journey across visits. So we keep our own first-party, lossless touch list.
//
// Model: an ORDERED array of touches in localStorage. Each UTM'd landing
// appends a touch. We don't try to guess which campaign "caused" the
// conversion (the browser structurally can't know that) — we faithfully
// record the journey and let the credit rule be chosen later, at analysis time.

/** How long a touch stays attributable. Configurable — bump it if you later
 *  decide a longer consideration window is appropriate. */
export const ATTRIBUTION_WINDOW_DAYS = 30;

/** Cap on stored touches (most-recent within the window are kept). Keeps the
 *  payload bounded so we never blow a beacon size limit. */
export const MAX_TOUCHES = 10;

const STORAGE_KEY = "pf_attribution_v1";
const WINDOW_MS = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

interface Touch {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** epoch ms this touch was captured (or last refreshed). */
  capturedAt: number;
}

function safeReadTouches(): Touch[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Touch => !!t && typeof t === "object" && typeof (t as Touch).capturedAt === "number",
    );
  } catch {
    return [];
  }
}

function safeWriteTouches(touches: Touch[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(touches));
  } catch {
    /* storage full / blocked / private mode — never throw */
  }
}

/** Drop touches older than the window, keep chronological order, cap length. */
function prune(touches: Touch[], now: number): Touch[] {
  const live = touches
    .filter((t) => now - t.capturedAt <= WINDOW_MS)
    .sort((a, b) => a.capturedAt - b.capturedAt);
  // Keep the MOST RECENT MAX_TOUCHES (tail of the sorted list).
  return live.length > MAX_TOUCHES ? live.slice(live.length - MAX_TOUCHES) : live;
}

/** Two touches are "the same campaign" if their source/medium/campaign match. */
function sameCampaign(a: Touch, b: Touch): boolean {
  return (
    a.utm_source === b.utm_source &&
    a.utm_medium === b.utm_medium &&
    a.utm_campaign === b.utm_campaign
  );
}

/** Read this page's UTMs; null if the landing URL carried none. */
function readIncomingTouch(now: number): Touch | null {
  try {
    if (typeof location === "undefined") return null;
    const params = new URLSearchParams(location.search);
    const touch: Touch = { capturedAt: now };
    let any = false;
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) {
        touch[key] = value;
        any = true;
      }
    }
    return any ? touch : null;
  } catch {
    return null;
  }
}

/**
 * Recompute the stored touch list on load:
 *   - prune anything past the window
 *   - if this landing carried UTMs, either refresh the matching campaign's
 *     timestamp (dedupe rule b) or append it as a new touch
 * Returns the live, ordered list.
 */
function syncTouches(): Touch[] {
  const now = Date.now();
  let touches = prune(safeReadTouches(), now);

  const incoming = readIncomingTouch(now);
  if (incoming) {
    const existing = touches.find((t) => sameCampaign(t, incoming));
    if (existing) {
      // Rule (b): re-clicking the same campaign refreshes its life rather than
      // stacking a duplicate. Keep the newest content/term, bump the timestamp.
      existing.capturedAt = now;
      existing.utm_content = incoming.utm_content;
      existing.utm_term = incoming.utm_term;
      // Re-prune so the refreshed touch sorts to the end (latest-touch).
      touches = prune(touches, now);
    } else {
      touches.push(incoming);
      touches = prune(touches, now);
    }
    safeWriteTouches(touches);
  }

  return touches;
}

// Computed once per page load. Subsequent track() calls reuse it.
const liveTouches: Touch[] = syncTouches();

/** Flatten a single touch into "src/medium/campaign" for convenience fields. */
function campaignLabel(t: Touch | undefined): string | undefined {
  if (!t) return undefined;
  const parts = [t.utm_source, t.utm_medium, t.utm_campaign].filter(Boolean);
  return parts.length ? parts.join("/") : undefined;
}

/** Attribution props attached to every event. */
function attributionProps(): Record<string, unknown> {
  const first = liveTouches[0];
  const last = liveTouches[liveTouches.length - 1];
  const props: Record<string, unknown> = {};

  // Convenience fields Plausible CAN slice as flat strings out of the box.
  const firstLabel = campaignLabel(first);
  const lastLabel = campaignLabel(last);
  if (firstLabel) props.first_campaign = firstLabel;
  if (lastLabel) props.last_campaign = lastLabel;
  if (liveTouches.length) props.touch_count = liveTouches.length;

  // Last-touch UTM fields, flat — keeps existing single-campaign slicing working.
  if (last) {
    for (const key of UTM_KEYS) {
      if (last[key]) props[key] = last[key];
    }
  }

  // The full ordered journey. Plausible flattens/stringifies the array (per the
  // ClickHouse rehearsal), so we ALSO send a pre-stringified twin below that
  // survives intact and is parseable back into the ordered list at analysis time.
  if (liveTouches.length) {
    props.attribution = liveTouches.map((t) => ({
      utm_source: t.utm_source,
      utm_medium: t.utm_medium,
      utm_campaign: t.utm_campaign,
      utm_content: t.utm_content,
      utm_term: t.utm_term,
      capturedAt: t.capturedAt,
    }));
    // Pre-stringified twin so you can compare what Plausible does to the array
    // vs. an explicit string column you control.
    try {
      props.attribution_json = JSON.stringify(props.attribution);
    } catch {
      /* ignore */
    }
  }

  return props;
}

/**
 * Record a funnel event by forwarding to self-hosted Plausible CE. Multi-touch
 * campaign attribution (ordered journey + first/last convenience fields) is
 * auto-attached to every event. Wrapped so analytics can never break the funnel.
 */
export function track(event: FunnelEvent | string, props?: Record<string, unknown>): void {
  // Merge attribution under the explicit props (explicit wins).
  const merged: Record<string, unknown> = { ...attributionProps(), ...(props ?? {}) };
  const hasProps = Object.keys(merged).length > 0;

  // Forward to Plausible CE if/when it's loaded. Plausible custom props are flat
  // key->string, so the `attribution` array gets stringified/coerced by it; the
  // `attribution_json` twin survives intact for analysis.
  try {
    window.plausible?.(event, hasProps ? { props: merged } : undefined);
  } catch {
    /* analytics must never break the funnel */
  }
}
