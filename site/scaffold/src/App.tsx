import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Starter lead-magnet page. This is an intentional, on-brand starting point for
// the builder agent — NOT a finished site. The agent should refine copy,
// strengthen the lead magnet, and complete the funnel against the decision
// files. Aesthetic: precise, technical, trustworthy — built for data engineers
// who distrust hype. Monospace accents, a measured grid, restraint over flash.
// ─────────────────────────────────────────────────────────────────────────────

type Status = "idle" | "submitting" | "ok" | "error";

export function App() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function submit() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setStatus("error");
      setMessage("Enter a valid work email.");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "hero", ts: Date.now() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("ok");
      setMessage("Check your inbox — the pipeline audit checklist is on its way.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Something broke on our end. Try again in a moment.");
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <span className="mark">▚ pipelineforge</span>
        <a className="topbar-cta" href="#capture">Get the checklist</a>
      </header>

      <section className="hero">
        <p className="eyebrow">FOR DATA TEAMS THAT CAN'T AFFORD A 3AM PAGE</p>
        <h1>
          Your pipelines should be boring.
          <br />
          <span className="accent">We make them boring.</span>
        </h1>
        <p className="sub">
          Done-for-you ETL/ELT for B2B SaaS — built, monitored, and fixed before
          you notice. No platform to learn. No team to hire.
        </p>

        <div id="capture" className="capture">
          <label htmlFor="email" className="sr-only">Work email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={status === "submitting"}
          />
          <button onClick={submit} disabled={status === "submitting"}>
            {status === "submitting" ? "Sending…" : "Send me the audit checklist"}
          </button>
        </div>
        <p className={`form-msg ${status}`} role="status">{message}</p>
        <p className="microcopy">
          The 23-point pipeline reliability audit we run on every new client. Free, no call required.
        </p>
      </section>

      <section className="proof">
        <div className="proof-item"><span className="num">99.95%</span><span>median pipeline uptime we hold</span></div>
        <div className="proof-item"><span className="num">&lt; 15min</span><span>median time-to-detect on failures</span></div>
        <div className="proof-item"><span className="num">0</span><span>dashboards your team has to babysit</span></div>
      </section>

      <footer className="foot">
        <span>© {new Date().getFullYear()} PipelineForge</span>
        <span className="foot-note">Builder: replace proof stats with real, defensible numbers before launch.</span>
      </footer>
    </main>
  );
}
