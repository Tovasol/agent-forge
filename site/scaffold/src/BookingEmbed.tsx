import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { CAL_LINK } from "./config";
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cal = await getCalApi();
        if (cancelled) return;
        cal("ui", {
          theme: "dark",
          cssVarsPerTheme: {
            light: { "cal-brand": "#2f7a4d" },
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
