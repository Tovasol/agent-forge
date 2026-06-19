// Central, operator-editable configuration.
// These are the only values that need changing to go live.

// Cal.com "username/event-type" slug for the 20-min discovery call.
// (Booking-provider decision: Cal.com free hosted + React embed.)
//
// HUMAN ACTION REQUIRED BEFORE LAUNCH: create the Cal.com event type and set
// VITE_CAL_LINK in the Pages build env (e.g. "pipelineforge/discovery-call").
// The fallback below is a PLACEHOLDER slug that will not resolve to a live
// calendar — leaving it unset means the primary money CTA dead-ends.
export const CAL_LINK = import.meta.env.VITE_CAL_LINK || "pipelineforge/discovery";

// Display name of the booking call, used in CTA copy and analytics.
export const DISCOVERY_CALL_LABEL = "Book a 20-min discovery call";

// Brand
export const BRAND = "PipelineForge";
