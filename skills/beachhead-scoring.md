# Skill: Beachhead scoring

Score each candidate segment 1–5 on these weighted criteria (Aulet's 8 + Moore's market conditions), then pick the one that scores well ACROSS all — not one with an extreme high and a fatal low.

Criteria and default weights (tunable; must sum to 1.0):
- compelling-reason-to-buy / urgency — 0.18
- customer-accessibility (can you reach them to sell) — 0.16
- founder-market-fit (skills, credibility, passion) — 0.16
- willingness-to-pay / well-funded customers — 0.16
- competition density (inverse: less is better) — 0.10
- whole-product deliverable by a solo operator — 0.08
- leverage to adjacent markets — 0.08
- speed-to-win the segment — 0.08

Moore's three conditions the winning segment should satisfy: customers buy similar products, share a common sales process, and talk to each other (word of mouth).

Output a scored matrix and a single recommended beachhead. A low score on founder-market-fit or reason-to-buy is usually disqualifying even if the total is high.
