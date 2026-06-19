// src/agents/grow.ts
// The growth engine. One invocation = one bounded unit of the highest-value
// work. The planner keeps the backlog full; the preparer does one task; the
// gate layer (enforced HERE, in code) ensures nothing that contacts a named
// person or spends money is auto-executed — it is routed to the approval queue
// and the agent moves on to the next ungated item instead of busy-spinning.

import { runAgentJson } from "../lib/agent.js";
import { prompt } from "../lib/prompts.js";
import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import type { BacklogTask } from "../lib/growth-types.js";
import { CHANNEL_POLICY, NEVER_AUTO_EXECUTE } from "../lib/channel-policy.js";
import {
  loadBacklog,
  saveBacklog,
  upsertTask,
  enqueueApproval,
  writeArtifact,
  pendingApprovals,
} from "../harness/backlog.js";
import { seedBacklog } from "../harness/seed-backlog.js";
import { selectNext, score } from "../harness/scorer.js";
import { recordSpend } from "../harness/budget.js";
import { loadState, recordNote } from "../harness/memory.js";

interface PlannerOut {
  newTasks: Array<Partial<BacklogTask>>;
  rescore: Array<{ id: string } & Partial<BacklogTask>>;
  rationale: string;
}

interface PreparerOut {
  artifactName: string;
  artifactContent: string;
  readyToExecute: boolean;
  requiresApproval: boolean;
  approvalSummary: string;
  estimatedCostUsd: number;
  notes: string;
  selfCheck: string;
}

function briefBlock(cfg: ForgeConfig): string {
  const b = cfg.brief;
  return `BUSINESS: ${b.businessName}\nNICHE: ${b.niche}\nICP: ${b.icp}\nGOAL: qualified discovery calls booked\nBUDGET: $${b.monthlyBudgetUsd}/mo\nSTACK: ${b.services.join(", ")}`;
}

/** Ensure the backlog exists; seed it on first run. */
export function ensureBacklog(): BacklogTask[] {
  let backlog = loadBacklog();
  if (!backlog.length) {
    backlog = seedBacklog();
    saveBacklog(backlog);
    log.ok("grow", `Seeded backlog with ${backlog.length} tasks.`);
  }
  return backlog;
}

async function runPlanner(cfg: ForgeConfig, backlog: BacklogTask[]) {
  try {
    const { data, meta } = await runAgentJson<PlannerOut>({
      cfg,
      model: cfg.models.lead,
      systemPrompt: prompt("planner"),
      permissionMode: "plan",
      allowedTools: ["WebSearch", "WebFetch"],
      prompt:
        briefBlock(cfg) +
        "\n\nCurrent backlog (id, channel, title, status, scores):\n" +
        backlog
          .map(
            (t) =>
              `- ${t.id} [${t.channel}] "${t.title}" status=${t.status} R${t.reach} I${t.impact} C${t.confidence} E${t.effort}`
          )
          .join("\n") +
        "\n\nReturn ONLY the planner JSON.",
    });
    recordSpend(cfg, meta.costUsd);
    return data;
  } catch (e) {
    log.warn("grow", "Planner step skipped: " + (e as Error).message);
    return { newTasks: [], rescore: [], rationale: "planner unavailable" } as PlannerOut;
  }
}

function applyPlanner(backlog: BacklogTask[], plan: PlannerOut): BacklogTask[] {
  const now = new Date().toISOString();
  let n = backlog.length;
  for (const nt of plan.newTasks ?? []) {
    if (!nt.title || !nt.channel) continue;
    // Force-classify per policy: the model's actionClass is advisory; spend or
    // named-contact channels are gated regardless.
    const channel = nt.channel as BacklogTask["channel"];
    const gated =
      nt.gateReason === "spends-money" ||
      nt.gateReason === "contacts-named-person" ||
      NEVER_AUTO_EXECUTE.includes(channel);
    backlog.push({
      id: `g-${String(++n).padStart(3, "0")}-${channel}`,
      channel,
      title: nt.title!,
      unitOfWork: nt.unitOfWork ?? nt.title!,
      acceptanceCriteria: nt.acceptanceCriteria ?? "",
      actionClass: gated ? "gate" : "execute",
      gateReason: (nt.gateReason as BacklogTask["gateReason"]) ?? "none",
      reach: nt.reach ?? 5,
      impact: nt.impact ?? 1,
      confidence: nt.confidence ?? 0.5,
      effort: nt.effort ?? 1,
      status: "backlog",
      createdAt: now,
      updatedAt: now,
      recurrence: (nt.recurrence as BacklogTask["recurrence"]) ?? "once",
      artifacts: [],
      notes: [],
      creditedCalls: 0,
    });
  }
  for (const rs of plan.rescore ?? []) {
    const t = backlog.find((x) => x.id === rs.id);
    if (!t) continue;
    if (typeof rs.confidence === "number") t.confidence = rs.confidence;
    if (typeof rs.impact === "number") t.impact = rs.impact;
    if (typeof rs.reach === "number") t.reach = rs.reach;
    if (typeof rs.effort === "number") t.effort = rs.effort;
    t.updatedAt = now;
  }
  return backlog;
}

/**
 * THE GATE ENFORCEMENT POINT.
 * Given a finished task + preparer output, decide whether it may auto-complete
 * or must go to the approval queue. This is intentionally stricter than the
 * model's own flag: policy wins.
 */
function enforceGate(task: BacklogTask, out: PreparerOut, artifactPath: string): "done" | "awaiting-approval" {
  const policyGated =
    task.actionClass === "gate" ||
    task.gateReason === "contacts-named-person" ||
    task.gateReason === "spends-money" ||
    NEVER_AUTO_EXECUTE.includes(task.channel) ||
    out.requiresApproval === true ||
    (out.estimatedCostUsd ?? 0) > 0;

  if (!policyGated) return "done";

  enqueueApproval({
    id: `appr-${task.id}-${Date.now()}`,
    taskId: task.id,
    channel: task.channel,
    gateReason: task.gateReason === "none" ? "contacts-named-person" : task.gateReason,
    title: task.title,
    summary: out.approvalSummary || `Review and execute: ${task.title}`,
    payloadPath: artifactPath,
    estimatedCostUsd: out.estimatedCostUsd || undefined,
    createdAt: new Date().toISOString(),
  });
  return "awaiting-approval";
}

async function runPreparer(cfg: ForgeConfig, task: BacklogTask) {
  const policy = CHANNEL_POLICY[task.channel];
  const { data, meta } = await runAgentJson<PreparerOut>({
    cfg,
    model: task.channel === "content" ? cfg.models.lead : cfg.models.worker,
    systemPrompt: prompt("preparer"),
    permissionMode: "plan",
    allowedTools: ["WebSearch", "WebFetch", "Read", "Glob", "Grep"],
    prompt:
      briefBlock(cfg) +
      `\n\nCHANNEL POLICY (${task.channel}):\n` +
      `  may execute: ${policy.mayExecute.join("; ")}\n` +
      `  must gate: ${policy.mustGate.map((g) => g.action).join("; ")}\n` +
      `  basis: ${policy.policyBasis}\n\n` +
      `TASK: ${task.title}\nUNIT OF WORK: ${task.unitOfWork}\n` +
      `ACCEPTANCE: ${task.acceptanceCriteria}\n` +
      `ACTION CLASS: ${task.actionClass} (gateReason: ${task.gateReason})\n\n` +
      "Do exactly this one unit of work and return ONLY the preparer JSON.",
  });
  recordSpend(cfg, meta.costUsd);
  return data;
}

/**
 * Run ONE growth cycle: refresh the backlog (planner), pick the best actionable
 * task, prepare it, and enforce the gate. Returns a short summary.
 */
export async function runGrowthCycle(cfg: ForgeConfig): Promise<string> {
  const state = loadState();
  state.currentPhase = "optimize"; // growth runs under the post-launch phase
  recordNote(state, "optimize", "Growth cycle started.");

  let backlog = ensureBacklog();

  // 1) Planner keeps the backlog full/varied (best-effort; non-fatal).
  const plan = await runPlanner(cfg, backlog);
  backlog = applyPlanner(backlog, plan);
  saveBacklog(backlog);
  if ((plan.newTasks ?? []).length) log.info("grow", `Planner added ${plan.newTasks.length} task(s).`);

  // 2) Select the highest-value ACTIONABLE task.
  const next = selectNext(backlog);
  if (!next) {
    const pend = pendingApprovals().length;
    const msg = pend
      ? `No actionable tasks — ${pend} item(s) await your approval (run \`npm run approvals\`).`
      : "No actionable tasks right now. Add to the backlog or check approvals.";
    log.warn("grow", msg);
    return msg;
  }

  const task = next.task;
  log.step("grow", `▶ ${task.channel}: ${task.title}  (RICE ${next.rice.toFixed(2)})`);
  task.status = "in-progress";
  task.lastRunAt = new Date().toISOString();
  upsertTask(task);

  // 3) Prepare the work.
  let out: PreparerOut;
  try {
    out = await runPreparer(cfg, task);
  } catch (e) {
    task.status = "backlog";
    task.notes.push(`Prepare failed: ${(e as Error).message}`);
    upsertTask(task);
    const msg = `Task "${task.title}" failed to prepare; returned to backlog.`;
    log.error("grow", msg);
    return msg;
  }

  // 4) Persist the artifact.
  const safeName = `${task.id}--${(out.artifactName || "artifact.md").replace(/[^a-z0-9.\-]/gi, "-")}`;
  const artifactPath = writeArtifact(safeName, out.artifactContent || "");
  task.artifacts.push(artifactPath);
  task.notes.push(out.notes || "");

  // 5) ENFORCE THE GATE (policy wins over the model's own flag).
  const verdict = enforceGate(task, out, artifactPath);
  task.status = verdict === "done"
    ? (task.recurrence && task.recurrence !== "once" ? "backlog" : "done")
    : "awaiting-approval";
  upsertTask(task);

  if (verdict === "awaiting-approval") {
    const msg = `Prepared "${task.title}" → drafted at ${artifactPath}. Needs your approval before it goes out (run \`npm run approvals\`).`;
    log.ok("grow", msg);
    recordNote(loadState(), "optimize", msg);
    return msg;
  }

  const msg = `Completed "${task.title}" autonomously → ${artifactPath}.`;
  log.ok("grow", msg);
  recordNote(loadState(), "optimize", msg);
  return msg;
}

/** Print the current scored backlog for the operator. */
export function reportBacklog(): void {
  const backlog = ensureBacklog();
  const scored = score(backlog);
  log.raw("\nGrowth backlog (by priority):");
  for (const s of scored.slice(0, 30)) {
    const t = s.task;
    const flag = t.actionClass === "gate" ? "🔒gate" : "⚙ auto";
    log.raw(
      `  ${flag}  RICE ${s.rice.toFixed(2).padStart(6)}  [${t.channel.padEnd(12)}] ${t.status.padEnd(16)} ${t.title}`
    );
  }
  const pend = pendingApprovals().length;
  log.raw(`\n  ${pend} item(s) awaiting approval.` + (pend ? " Run `npm run approvals`." : ""));
}
