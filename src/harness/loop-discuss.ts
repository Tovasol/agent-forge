// src/harness/loop-discuss.ts
// A turn-by-turn DISCUSSION with the framework about a specific idea — the missing
// two-way channel. The agent holds full context (brief, operator profile/resume,
// the current stage's intent + gate + artifacts, accumulated facts/metrics/lessons)
// and can defend, concede, or refine its reasoning. The exchange is logged to the
// idea's episodic memory so conclusions actually feed the stage.
//
// At the end (or when you type /done) the agent proposes a concrete CONCLUSION:
// optional fact updates + an optional re-run of a stage. Per the operator's choice,
// we ALWAYS ask before applying it — nothing changes the idea without confirmation.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import { runAgentJson } from "../lib/agent.js";
import { recordSpend } from "./budget.js";
import { loadProfile } from "../agents/venture/profile.js";
import { profileSummary } from "../lib/operator-types.js";
import {
  loadIdea,
  loadIdeaSpec,
  getFacts,
  getMetrics,
  setFact,
  episodic,
  listArtifacts,
  ideaPath,
} from "./loop-memory.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runIdeaLoop, pivotIdea } from "./loop-executor.js";

interface Turn {
  role: "operator" | "framework";
  text: string;
}

interface DiscussReply {
  /** The agent's conversational answer to the operator's latest message. */
  reply: string;
  /** When the agent believes the discussion has reached an actionable conclusion. */
  conclusion?: {
    summary: string; // one-line decision reached
    factUpdates?: Record<string, unknown>; // facts to write to semantic memory
    rerunStage?: string; // a stage id to re-open and re-run to apply the decision
  };
}

function loadStageArtifacts(ideaId: string, stageId: string): string {
  const names = listArtifacts(ideaId).filter((n) => n.startsWith(`${stageId}/`));
  const chunks: string[] = [];
  for (const n of names.slice(0, 8)) {
    const p = resolve(ideaPath(ideaId), "artifacts", n);
    if (existsSync(p)) {
      const body = readFileSync(p, "utf8");
      chunks.push(`### ${n}\n${body.slice(0, 4000)}`);
    }
  }
  return chunks.join("\n\n") || "(no artifacts yet for this stage)";
}

const SYS = `You are the venture framework discussing a decision WITH the operator — a peer
conversation, not a lecture. You know their real background (resume-derived profile) and the
current stage's work. When the operator challenges a recommendation (e.g. "do I really need this
certification given my experience?"), reason honestly and specifically against THEIR profile:
concede when they're right, hold your ground with concrete reasoning when warranted, and quantify
trade-offs. Prefer leveraging credentials/experience the operator ALREADY has over acquiring new
ones, unless a buyer in this niche demonstrably requires the new credential. Be concise and direct.
Only emit a "conclusion" when the discussion has actually resolved into a decision (the operator
signals agreement or asks you to lock it in). Return ONLY JSON.`;

export async function discussIdea(cfg: ForgeConfig, ideaId: string, opts: { stage?: string } = {}): Promise<void> {
  const idea = loadIdea(ideaId);
  if (!idea) {
    log.error("discuss", `No idea "${ideaId}".`);
    return;
  }
  const spec = loadIdeaSpec(ideaId);
  const stageId = opts.stage || idea.currentStage;
  const stage = spec.stages.find((s) => s.id === stageId);
  const profile = loadProfile();
  const profileBlock = profile ? profileSummary(profile) : "(no operator profile on file — run `forge venture profile` to derive one from the resume)";

  log.raw(`\n💬 Discussing idea "${idea.hint}" — stage: ${stage?.title ?? stageId}`);
  log.raw(`   The framework has your brief, resume-derived profile, and this stage's work in context.`);
  log.raw(`   Type your message and press enter. Commands: /done to finish, /stage <id> to switch focus, /quit to leave without applying.\n`);

  const rl = createInterface({ input, output });
  const history: Turn[] = [];

  const baseContext =
    `IDEA: ${idea.hint}\n` +
    `STAGE IN FOCUS: ${stage?.title ?? stageId} (#${stageId})\n` +
    (stage ? `STAGE INTENT: ${stage.intent}\nSTAGE GATE: ${stage.gate.predicate} (advance: ${stage.gate.advance})\n` : "") +
    `\nOPERATOR PROFILE (their real means/credentials):\n${profileBlock}\n\n` +
    `KNOWN FACTS:\n${JSON.stringify(getFacts(ideaId), null, 2)}\n\n` +
    `CURRENT METRICS:\n${JSON.stringify(getMetrics(ideaId), null, 2)}\n\n` +
    `THIS STAGE'S ARTIFACTS:\n${stage ? loadStageArtifacts(ideaId, stageId) : "(n/a)"}\n`;

  let pendingConclusion: DiscussReply["conclusion"] | undefined;

  try {
    while (true) {
      const msg = (await rl.question("you › ")).trim();
      if (!msg) continue;
      if (msg === "/quit") {
        log.raw("Left the discussion. Nothing applied.");
        return;
      }
      if (msg === "/stage") {
        log.raw(`Current stage: ${stageId}. Use /stage <id>. Stages: ${spec.stages.map((s) => s.id).join(", ")}`);
        continue;
      }
      if (msg.startsWith("/stage ")) {
        const newStage = msg.slice(7).trim();
        if (spec.stages.some((s) => s.id === newStage)) {
          log.raw(`Switching focus to "${newStage}". (Restart discuss to reload its artifacts.)`);
          return discussIdea(cfg, ideaId, { stage: newStage });
        }
        log.raw(`Unknown stage "${newStage}".`);
        continue;
      }
      const finishing = msg === "/done";
      const operatorText = finishing ? "Let's lock in what we've decided. Summarize the conclusion and what should change." : msg;

      history.push({ role: "operator", text: operatorText });
      episodic(ideaId).add(stageId, `operator (discuss): ${operatorText}`, "event");

      const transcript = history.map((t) => `${t.role === "operator" ? "OPERATOR" : "FRAMEWORK"}: ${t.text}`).join("\n");

      const { data, meta } = await runAgentJson<DiscussReply>({
        cfg,
        model: cfg.models.lead,
        label: "loop:discuss",
        intent: "discussing the decision with the operator",
        systemPrompt: SYS,
        allowedTools: ["WebSearch", "WebFetch"], // may check e.g. whether a niche's buyers demand a cert
        prompt:
          `${baseContext}\n\nCONVERSATION SO FAR:\n${transcript}\n\n` +
          `Respond to the operator's latest message. ${finishing ? "The operator wants to finish — provide a conclusion." : "Only provide a conclusion if the discussion has resolved."}\n` +
          `Return ONLY: {"reply":"<your answer>","conclusion":{"summary":"...","factUpdates":{...},"rerunStage":"<stageId or omit>"} (omit conclusion if not resolved)}`,
      });
      recordSpend(cfg, meta.costUsd);

      const reply = data.reply ?? "(no reply)";
      log.raw(`\nframework › ${reply}\n`);
      history.push({ role: "framework", text: reply });
      episodic(ideaId).add(stageId, `framework (discuss): ${reply}`, "event");

      if (data.conclusion) {
        pendingConclusion = data.conclusion;
        log.raw(`\n— proposed conclusion —\n${data.conclusion.summary}`);
        if (data.conclusion.factUpdates && Object.keys(data.conclusion.factUpdates).length)
          log.raw(`facts to update: ${JSON.stringify(data.conclusion.factUpdates)}`);
        if (data.conclusion.rerunStage) log.raw(`would re-run stage: ${data.conclusion.rerunStage}`);

        // ASK before applying — per operator's chosen policy, nothing changes without confirmation.
        const ans = (await rl.question("\nApply this conclusion and re-run? [y]es / [r]ecord only / [n]o, keep talking › ")).trim().toLowerCase();
        if (ans === "y" || ans === "yes") {
          await applyConclusion(cfg, ideaId, pendingConclusion, { rerun: true });
          return;
        } else if (ans === "r" || ans === "record") {
          await applyConclusion(cfg, ideaId, pendingConclusion, { rerun: false });
          return;
        } else {
          log.raw("Okay — keep talking. (Type /done when ready, or /quit to discard.)");
          pendingConclusion = undefined;
        }
      }

      if (finishing && !data.conclusion) {
        log.raw("No actionable conclusion was reached. Type /quit to leave, or keep talking.");
      }
    }
  } finally {
    rl.close();
  }
}

async function applyConclusion(
  cfg: ForgeConfig,
  ideaId: string,
  conclusion: NonNullable<DiscussReply["conclusion"]>,
  opts: { rerun: boolean },
): Promise<void> {
  // Record the decision as a durable fact + episodic verdict.
  setFact(ideaId, `discussion_decision_${Date.now().toString(36)}`, conclusion.summary);
  episodic(ideaId).add(conclusion.rerunStage || "discuss", `DISCUSSION CONCLUSION: ${conclusion.summary}`, "verdict");

  if (conclusion.factUpdates && Object.keys(conclusion.factUpdates).length) {
    for (const [k, v] of Object.entries(conclusion.factUpdates)) setFact(ideaId, k, v);
    log.ok("discuss", `Recorded ${Object.keys(conclusion.factUpdates).length} fact update(s).`);
  }

  if (opts.rerun && conclusion.rerunStage) {
    log.info("discuss", `Re-opening and re-running "${conclusion.rerunStage}" to apply the decision…`);
    pivotIdea(ideaId, conclusion.rerunStage);
    await runIdeaLoop(cfg, ideaId);
  } else {
    log.ok("discuss", "Conclusion recorded. Re-run when ready: " + `npm run forge -- idea run ${ideaId}`);
  }
}
