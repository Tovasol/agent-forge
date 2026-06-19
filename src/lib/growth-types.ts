// src/lib/growth-types.ts
// Types for the growth-agent backlog/planner module.

export type Channel =
  | "foundational" // ICP, positioning, competitor monitoring
  | "content" // blog / SEO / lead magnets
  | "linkedin" // founder-led posts + DMs (DRAFT ONLY)
  | "coldemail" // outbound (RESEARCH + DRAFT ONLY, send is gated)
  | "community"; // reddit / HN / slack / discord (DRAFT ONLY)

// The autonomy classification for a task's terminal action.
//   execute  -> agent may carry it out autonomously (low-risk: draft, publish
//               to own site, on-page SEO, research public sources).
//   gate     -> agent prepares it, but a human must approve before the
//               external/irreversible step (contacts a NAMED person, or spends
//               money). Enforced in code, not just convention.
export type ActionClass = "execute" | "gate";

export type GateReason =
  | "contacts-named-person"
  | "spends-money"
  | "none";

export type TaskStatus =
  | "backlog" // not yet started
  | "in-progress"
  | "prepared" // work done; if gated, waiting for approval
  | "awaiting-approval"
  | "approved" // human approved the gated action
  | "done"
  | "skipped"
  | "blocked"; // a channel was auto-paused (e.g. deliverability alarm)

export interface BacklogTask {
  id: string;
  channel: Channel;
  title: string;
  /** One concrete, single-session unit of work with acceptance criteria. */
  unitOfWork: string;
  acceptanceCriteria: string;
  actionClass: ActionClass;
  gateReason: GateReason;

  // RICE/ICE scoring — all scored against the goal: QUALIFIED CALLS BOOKED.
  reach: number; // 1..10 expected reach
  impact: number; // 0.25,0.5,1,2,3 (RICE impact scale)
  confidence: number; // 0..1
  effort: number; // person-hours (>=0.5)

  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  recurrence?: "once" | "daily" | "weekly" | "monthly";

  // Outputs produced by the worker (paths under memory/growth/artifacts/).
  artifacts: string[];
  // Free-form notes / results log.
  notes: string[];
  // Attribution: booked-calls credited to this task/channel over time.
  creditedCalls?: number;
}

export interface ApprovalItem {
  id: string;
  taskId: string;
  channel: Channel;
  gateReason: GateReason;
  title: string;
  summary: string;
  // The exact thing awaiting approval (e.g. recipient + drafted email, or a
  // drafted LinkedIn post, or a spend amount).
  payloadPath: string; // path to the drafted artifact
  estimatedCostUsd?: number;
  createdAt: string;
  decided?: "approved" | "rejected";
  decidedAt?: string;
}

// RICE score helper result.
export interface ScoredTask {
  task: BacklogTask;
  rice: number;
  ice: number;
  // Priority used by the planner (RICE, with a small recency penalty so
  // recurring work rotates and the agent isn't idle).
  priority: number;
}

export interface AttributionRow {
  source: string; // self-reported or UTM source
  channel: Channel | "unknown";
  calls: number;
  updatedAt: string;
}
