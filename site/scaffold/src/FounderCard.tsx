import { useState } from "react";
import { FOUNDER, HAS_FOUNDER } from "./config";

// A named human beside the booking CTA (social-proof decision). Renders the real
// founder's photo, name, and one-line credential so the discovery call is "talk
// to a person," not "fill a faceless calendar."
//
// Honesty guardrail: if no real founder name is configured (VITE_FOUNDER_NAME
// unset), this renders NOTHING — we never show an invented person. The photo
// gracefully hides itself if the headshot asset is missing.

interface FounderCardProps {
  /** "inline" sits beside the embed; "compact" is a slim one-liner for the topbar area. */
  variant?: "inline" | "compact";
}

export function FounderCard({ variant = "inline" }: FounderCardProps) {
  const [imgOk, setImgOk] = useState(true);
  if (!HAS_FOUNDER) return null;

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
