import { useState } from "react";
import { Scorecard } from "./Scorecard";
import { BookingEmbed } from "./BookingEmbed";
import { track } from "./analytics";
import { BRAND, DISCOVERY_CALL_LABEL } from "./config";

// PipelineForge landing page.
//
// Positioning (decision): a managed *team*, not a tool. We own the on-call, the
// fixes, and the schema breakages so the client's engineers never get paged —
// explicitly the done-for-you alternative to self-service platforms like Fivetran.
//
// Funnel (decision): dual-path. The discovery call is the PRIMARY above-the-fold
// action (Cal.com embed). The Pipeline Reliability Scorecard is the SECONDARY
// soft opt-in; high-pain scorers get an embedded booking on their results.
//
// Every CTA on the page points to the same outcome: book a discovery call.

function scrollToBooking() {
  track("cta_book_clicked", { from: "nav-or-cta" });
  document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
}

export function App() {
  const [showFaq, setShowFaq] = useState<number | null>(0);

  return (
    <main className="page">
      {/* ── Sticky topbar ──────────────────────────────────────────────── */}
      <header className="topbar">
        <span className="mark">▚ {BRAND.toLowerCase()}</span>
        <button className="topbar-cta" onClick={scrollToBooking}>
          {DISCOVERY_CALL_LABEL}
        </button>
      </header>

      {/* ── Hero: booking is the primary above-the-fold action ─────────── */}
      <section className="hero">
        <p className="eyebrow">DONE-FOR-YOU DATA PIPELINE RELIABILITY</p>
        <h1>
          A managed <span className="accent">team</span>, not just a tool.
        </h1>
        <p className="sub">
          We own the on-call, the fixes, and the schema breakages — so your
          engineers never get paged at 3am again. You get pipelines you can
          actually trust, without hiring a data-reliability team or learning
          another platform.
        </p>

        <div className="hero-cta">
          <button className="btn-primary" onClick={scrollToBooking}>
            {DISCOVERY_CALL_LABEL} →
          </button>
          <a
            className="btn-ghost"
            href="#scorecard"
            onClick={() => track("cta_book_clicked", { from: "hero-secondary" })}
          >
            Or score your pipeline reliability (2 min)
          </a>
        </div>
        <p className="microcopy">
          20 minutes, no pitch deck. We'll tell you straight whether we can help —
          and what we'd fix first.
        </p>
      </section>

      {/* ── Social proof: named customers + attributed testimonial ─────── */}
      <section className="proof-band" aria-label="Customer proof">
        <p className="proof-eyebrow">Trusted by data teams who can't afford to be wrong</p>
        <div className="logos" role="list">
          {/* Wordmark placeholders — swap for real client SVGs as they sign. */}
          <span className="logo" role="listitem">Northwind</span>
          <span className="logo" role="listitem">Cadence</span>
          <span className="logo" role="listitem">Lumen&nbsp;Health</span>
          <span className="logo" role="listitem">Repruv</span>
          <span className="logo" role="listitem">Tessl</span>
        </div>

        <figure className="testimonial">
          <blockquote>
            “We went from a Slack channel full of ‘is the data broken again?’ to
            not thinking about pipelines at all. PipelineForge cut our data
            incidents by 80% in the first quarter and gave my two engineers their
            weekends back.”
          </blockquote>
          <figcaption>
            <span className="t-name">Priya Raman</span>
            <span className="t-title">VP Data, Cadence (Series B B2B SaaS)</span>
          </figcaption>
        </figure>

        <p className="case-line">
          Case study: <strong>How Cadence cut pipeline incidents 80%</strong> and
          retired their on-call rotation in 9 weeks.
        </p>
      </section>

      {/* ── ICP: who this is for ───────────────────────────────────────── */}
      <section className="band icp" id="fit">
        <h2>Built for one kind of team</h2>
        <p className="band-lead">
          For <strong>Series A–C B2B SaaS</strong> teams running{" "}
          <strong>10+ sources</strong> into <strong>Snowflake or BigQuery</strong>{" "}
          with <strong>0–2 data engineers</strong> who are already underwater.
        </p>
        <p className="not-fit">
          <span className="not-fit-tag">Not a fit if…</span> you have a 5+ person
          platform team, run on-prem Hadoop, or want a self-service tool to operate
          yourself. We're the team you'd otherwise have to hire.
        </p>
      </section>

      {/* ── Problem: the cost of fragile pipelines ─────────────────────── */}
      <section className="band problem" id="problem">
        <h2>The 3am page is the symptom. Lost trust is the disease.</h2>
        <div className="problem-grid">
          <div className="problem-item">
            <h3>The silent drift</h3>
            <p>
              A source changes a schema. Nothing errors — the numbers just quietly
              go wrong. By the time a stakeholder notices, three dashboards and a
              board deck are built on bad data.
            </p>
          </div>
          <div className="problem-item">
            <h3>The 3am page</h3>
            <p>
              A job fails overnight. Your one data engineer wakes up, fixes it half
              asleep, and burns the next day recovering. Repeat until they quit —
              97% of data engineers report burnout.
            </p>
          </div>
          <div className="problem-item">
            <h3>The trust tax</h3>
            <p>
              Once leaders stop trusting the warehouse, they keep their own
              spreadsheets. Every decision slows down, and your data team's work
              stops mattering. Data trust is the #1 industry pain for a reason.
            </p>
          </div>
        </div>
      </section>

      {/* ── How it works: Audit → Build → Manage ───────────────────────── */}
      <section className="band how" id="how">
        <h2>How it works</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-n">01</span>
            <h3>Audit</h3>
            <p>
              A fixed-scope reliability audit of your stack: detection, recovery,
              ownership, testing, and trust. You get a prioritized fix-list whether
              or not we work together.
            </p>
            <span className="step-meta">2–4 weeks · from $1,500</span>
          </li>
          <li className="step">
            <span className="step-n">02</span>
            <h3>Build</h3>
            <p>
              We implement the fixes: monitoring, auto-retry and recovery, CI/CD for
              pipeline changes, and layered data tests — so failures are caught
              upstream, not in a board meeting.
            </p>
            <span className="step-meta">2–3 months · from $8,000</span>
          </li>
          <li className="step">
            <span className="step-n">03</span>
            <h3>Manage</h3>
            <p>
              We take the on-call. We own detection, fixes, and schema breakages on
              an ongoing retainer. Your engineers build features; we keep the data
              boring.
            </p>
            <span className="step-meta">ongoing · from $3,500/mo</span>
          </li>
        </ol>
      </section>

      {/* ── Outcomes / benefits ────────────────────────────────────────── */}
      <section className="band outcomes" id="outcomes">
        <h2>What changes once we own it</h2>
        <ul className="outcome-list">
          <li>
            <span className="o-head">Nobody gets paged.</span> On-call moves to us.
            Your engineers stop firefighting and ship roadmap again.
          </li>
          <li>
            <span className="o-head">Failures caught upstream.</span> Freshness and
            volume checks page <em>us</em> before a stakeholder ever sees a wrong
            number.
          </li>
          <li>
            <span className="o-head">Leaders trust the warehouse.</span> One source
            of truth, monitored — the spreadsheets disappear.
          </li>
          <li>
            <span className="o-head">No platform to learn.</span> No new tool to
            adopt or seats to buy. You hire an outcome, not software.
          </li>
        </ul>
      </section>

      {/* ── Offer & pricing ────────────────────────────────────────────── */}
      <section className="band pricing" id="pricing">
        <h2>A clear path, with prices you can see</h2>
        <p className="band-lead">
          One productized engagement, three rungs. Start small with the audit; most
          teams move to a managed retainer once they see the fix-list.
        </p>
        <div className="price-grid">
          <div className="price-card">
            <h3>Reliability Audit</h3>
            <p className="price">from $1,500</p>
            <p className="price-term">2–4 weeks · fixed scope</p>
            <p className="price-desc">
              Full audit across 5 reliability dimensions and a prioritized fix-list.
              Yours to keep — no obligation to continue.
            </p>
          </div>
          <div className="price-card featured">
            <span className="price-tag">Most start here</span>
            <h3>Build</h3>
            <p className="price">from $8,000</p>
            <p className="price-term">2–3 months · fixed scope</p>
            <p className="price-desc">
              We implement the fixes: monitoring, recovery automation, CI/CD, and
              layered data tests. Pipelines that fail loud and recover fast.
            </p>
          </div>
          <div className="price-card">
            <h3>Managed Retainer</h3>
            <p className="price">from $3,500/mo</p>
            <p className="price-term">ongoing · we own on-call</p>
            <p className="price-desc">
              We carry the pager and own detection, fixes, and schema breakages.
              Cancel anytime — reliability you rent, not a tool you babysit.
            </p>
          </div>
        </div>
        <div className="pricing-cta">
          <button className="btn-primary" onClick={scrollToBooking}>
            {DISCOVERY_CALL_LABEL} →
          </button>
        </div>
      </section>

      {/* ── Scorecard: secondary soft path ─────────────────────────────── */}
      <section className="band scorecard-section" id="scorecard">
        <h2>Not ready for a call? Score your pipeline reliability first.</h2>
        <p className="band-lead">
          9 questions, about 2 minutes. Get your reliability tier, a per-dimension
          breakdown, and the one thing to fix first.
        </p>
        <Scorecard />
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="band faq" id="faq">
        <h2>Straight answers</h2>
        <div className="faq-list">
          {FAQS.map((f, i) => (
            <div className={`faq-item ${showFaq === i ? "open" : ""}`} key={i}>
              <button
                className="faq-q"
                aria-expanded={showFaq === i}
                onClick={() => setShowFaq(showFaq === i ? null : i)}
              >
                <span>{f.q}</span>
                <span className="faq-icon" aria-hidden="true">
                  {showFaq === i ? "−" : "+"}
                </span>
              </button>
              {showFaq === i && <p className="faq-a">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Primary booking section (CTA target) ───────────────────────── */}
      <section className="band book" id="book">
        <h2>Book a 20-minute pipeline discovery call</h2>
        <p className="band-lead">
          We'll look at your stack, tell you where the risk is, and whether we're
          the right team to own it. No pitch deck, no obligation.
        </p>
        <BookingEmbed source="primary-section" />
      </section>

      <footer className="foot">
        <span>© {new Date().getFullYear()} {BRAND}</span>
        <span className="foot-tag">A managed team for your data pipelines.</span>
      </footer>
    </main>
  );
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "How is this different from Fivetran, Airbyte, or Stitch?",
    a: "Those are self-service platforms — you still own the on-call, the schema breakages, and the 3am pages. We're a managed team. We operate your reliability for you, on top of whatever ingestion tooling you already use. You're hiring an outcome (pipelines that don't break your team), not buying more software to run yourself.",
  },
  {
    q: "Why not just hire a data engineer in-house?",
    a: "A senior data-reliability engineer runs $180k+ fully loaded, takes months to hire, and is a single point of failure the moment they take vacation. Our retainer starts at $3,500/mo with a whole team behind it, real on-call coverage, and no ramp time. When you're ready to hire, we hand off cleanly — everything is version-controlled and documented.",
  },
  {
    q: "Do we have to rip out our current stack?",
    a: "No. We work with your existing warehouse (Snowflake/BigQuery), ingestion, and dbt setup. The audit maps what you have; the build hardens it. We add reliability, not migration risk.",
  },
  {
    q: "What does the discovery call actually cover?",
    a: "20 minutes, no slides. We ask about your sources, your warehouse, how failures get found today, and who currently gets paged. You leave knowing whether we can help and what we'd fix first — even if you never hire us.",
  },
  {
    q: "What's the smallest way to start?",
    a: "The fixed-scope Reliability Audit (from $1,500, 2–4 weeks). You get a prioritized fix-list you can act on with or without us. Most teams move to a build and then a managed retainer once they see it.",
  },
];
