import { useState } from "react";
import { FOUNDER, HAS_FOUNDER, HAS_CREDENTIAL } from "./config";

// A trust card beside the booking CTA (social-proof decision). It answers the
// buyer's #1 unspoken question for a service that takes over on-call: "who is the
// real human/expert I'm trusting with production warehouse access?"
//
// Two honest modes:
//  1. NAMED (post-public): real founder name + photo + credential — strongest
//     conversion (STX Next pattern). Active when VITE_FOUNDER_NAME is set.
//  2. DE-IDENTIFIED (Option A, current): no name, no photo — just the real,
//     verifiable capability of the senior delivery engineer. The company
//     (Tovasol LLC) is the public-facing entity; the engineer is described by
//     track record, not identity. True and specific, just not doxxing.
//
// Honesty guardrail: we NEVER show an invented person. Named mode requires a real
// configured name; de-identified mode shows only factual capability copy.

interface FounderCardProps {
  /** "inline" sits beside the embed; "compact" is a slim one-liner for the topbar area. */
  variant?: "inline" | "compact";
}

export function FounderCard({ variant = "inline" }: FounderCardProps) {
  const [imgOk, setImgOk] = useState(true);

  // Named mode — only when a real founder name is configured.
  if (HAS_FOUNDER) {
    const initial = FOUNDER.name.trim().charAt(0).toUpperCase();
    return (
      <div className={`founder-card ${variant}`}>
        <div className="founder-photo" aria-hidden={!imgOk}>
          {imgOk ? (
            <img
              src={FOUNDER.photo}
              alt={`${FOUNDER.name}, founder of PipelineForge`}
              loading="lazy"
              onError={() => setImgOk(false)}
            />
          ) : (
            <span className="founder-initial" aria-hidden="true">
              {initial}
            </span>
          )}
        </div>
        <p className="founder-copy">
          You'll talk to <strong>{FOUNDER.name}</strong>
          {FOUNDER.credential ? <> — {FOUNDER.credential}.</> : "."}
        </p>
      </div>
    );
  }

  // De-identified mode (Option A) — capability without identity. No photo.
  if (HAS_CREDENTIAL) {
    return (
      <div className={`founder-card credential-only ${variant}`}>
        <p className="founder-copy">
          You'll talk directly to {FOUNDER.credential}. No account managers, no
          junior hand-offs — the person who'll own your pipelines is the person on
          the call.
        </p>
      </div>
    );
  }

  // Nothing real to show — render nothing rather than a faceless placeholder.
  return null;
}
