// Lightweight analytics shim. Funnels are measured in PostHog (free tier,
// EU-host option) per the analytics decision; Cloudflare Web Analytics handles
// raw traffic via a script tag in index.html. This module is safe to call even
// when PostHog isn't loaded (e.g. local dev or before the key is set), so the
// funnel code never has to guard each call site.

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void;
      identify: (id: string, props?: Record<string, unknown>) => void;
    };
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  try {
    window.posthog?.capture(event, props);
  } catch {
    /* analytics must never break the funnel */
  }
}

export function identify(id: string, props?: Record<string, unknown>): void {
  try {
    window.posthog?.identify(id, props);
  } catch {
    /* no-op */
  }
}
