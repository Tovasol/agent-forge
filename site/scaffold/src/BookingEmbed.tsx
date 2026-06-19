import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { CAL_LINK, HAS_CAL, CONTACT_EMAIL, DISCOVERY_CALL_LABEL } from "./config";
import { track } from "./analytics";

// Inline Cal.com discovery-call embed (booking-provider decision: Cal.com free
// hosted + @calcom/embed-react). Themed dark to match the brand, prefilled with
// the lead's email/company when we have them (from the scorecard gate), and
// wired to fire the booking_completed conversion event.

interface BookingEmbedProps {
  /** Prefill the booking form when we already captured these. */
  email?: string;
  name?: string;
  /** Passed to analytics so we know which path booked (hero vs scorecard). */
  source?: string;
}

export function BookingEmbed({ email, name, source = "unknown" }: BookingEmbedProps) {
  // Graceful degradation: if no real Cal.com slug has been configured at build
  // time, NEVER render a broken/placeholder calendar (a silent dead-end on the
  // primary money CTA). Show an honest "opening shortly" state with a working
  // mailto path so the visitor still reaches a human. Mirrors the founder card's
  // env-gated behaviour. The live calendar appears automatically once a human
  // sets VITE_CAL_LINK — no code change required.
  if (!HAS_CAL) {
    return <BookingFallback email={email} source={source} />;
  }

  return <CalEmbed email={email} name={name} source={source} />;
}

function CalEmbed({ email, name, source = "unknown" }: BookingEmbedProps) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cal = await getCalApi();
        if (cancelled) return;
        cal("ui", {
          theme: "light",
          cssVarsPerTheme: {
            light: { "cal-brand": "#16a34a" },
            dark: { "cal-brand": "#5ef38c" },
          },
          hideEventTypeDetails: false,
          layout: "month_view",
        });
        // Fire conversion when a booking succeeds inside the iframe.
        cal("on", {
          action: "bookingSuccessful",
          callback: () => track("booking_completed", { source }),
        });
      } catch {
        /* embed failing must never crash the page */
      }
    })();
    track("booking_opened", { source });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div className="booking-embed">
      <Cal
        calLink={CAL_LINK}
        style={{ width: "100%", height: "100%", overflow: "scroll" }}
        config={{
          ...(email ? { email } : {}),
          ...(name ? { name } : {}),
          layout: "month_view",
        }}
      />
    </div>
  );
}

// Honest pre-launch fallback shown when no real Cal.com slug is configured.
// Keeps the primary CTA reaching a human (mailto) instead of a dead calendar.
function BookingFallback({ email, source = "unknown" }: BookingEmbedProps) {
  useEffect(() => {
    track("booking_fallback_shown", { source });
  }, [source]);

  const subject = encodeURIComponent("Pipeline discovery call");
  const body = encodeURIComponent(
    email ? `Hi — I'd like to book a discovery call.\n\nMy email: ${email}` : "",
  );
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${subject}${body ? `&body=${body}` : ""}`;

  return (
    <div className="booking-fallback" role="status">
      <p className="booking-fallback-lead">
        Online booking is opening shortly. In the meantime, email us and we'll
        send you two times this week.
      </p>
      <a
        className="cta cta-primary"
        href={mailto}
        onClick={() => track("booking_fallback_email_click", { source })}
      >
        {DISCOVERY_CALL_LABEL} →
      </a>
      <p className="booking-fallback-note">
        We usually reply within one business day.
      </p>
    </div>
  );
}
