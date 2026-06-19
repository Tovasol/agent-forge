// Central, operator-editable configuration.
// These are the only values that need changing to go live.

// Cal.com "username/event-type" slug for the 20-min discovery call.
// (Booking-provider decision: Cal.com free hosted + React embed.)
//
// HUMAN ACTION REQUIRED BEFORE LAUNCH: create the Cal.com event type and set
// VITE_CAL_LINK in the Pages build env (e.g. "pipelineforge/discovery-call").
//
// IMPORTANT: there is intentionally NO placeholder-slug fallback. A placeholder
// slug renders a broken, non-existent Cal.com calendar — a silent dead-end on
// the venture's primary money CTA, which is strictly worse than rendering
// nothing. Instead, when VITE_CAL_LINK is unset the booking UI degrades
// gracefully (see HAS_CAL / BookingEmbed) exactly like the founder card: it
// shows an honest "booking opening shortly" state with a working mailto path,
// and never ships a broken calendar. The real booking goes live the moment a
// human supplies the real slug — no code change required.
export const CAL_LINK = (import.meta.env.VITE_CAL_LINK || "").trim();

/** True only when a real Cal.com slug has been supplied at build time. */
export const HAS_CAL = CAL_LINK.length > 0;

// Fallback contact for the (rare) pre-launch window where the booking slug is
// not yet configured, so the primary CTA still reaches a human instead of a
// dead calendar. Operator-editable.
export const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL || "hello@pipelineforge.io").trim();

// Display name of the booking call, used in CTA copy and analytics.
export const DISCOVERY_CALL_LABEL = "Book a 20-min discovery call";

// Brand
export const BRAND = "PipelineForge";

// ── Founder identity (named human beside the booking CTA) ────────────────────
// Decision (social-proof): put a real founder name + photo + one-line credential
// next to the booking embed — a named human converts a discovery call far better
// than a faceless calendar (STX Next pattern), and it is fully honest pre-launch
// because it's our actual founder.
//
// HUMAN ACTION BEFORE LAUNCH: set these to the founder's REAL details. Do NOT
// invent a name. Until VITE_FOUNDER_NAME is set, the founder card simply does not
// render (no placeholder/fabricated person is ever shown). Drop a real headshot
// at public/founder.jpg (or set VITE_FOUNDER_PHOTO to its path) for the photo.
export const FOUNDER = {
  name: import.meta.env.VITE_FOUNDER_NAME || "",
  // One-line credential. Editable; the default is a truthful, generic statement
  // about the founder's background that holds for whoever the real founder is.
  credential:
    import.meta.env.VITE_FOUNDER_CREDENTIAL ||
    "carried production-warehouse on-call at venture-backed SaaS",
  photo: import.meta.env.VITE_FOUNDER_PHOTO || "/founder.jpg",
} as const;

/** True only when a real founder name has been supplied. */
export const HAS_FOUNDER = FOUNDER.name.trim().length > 0;
