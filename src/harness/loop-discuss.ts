// src/harness/loop-discuss.ts
// A turn-by-turn DISCUSSION with the framework about a specific idea — the missing
// two-way channel. The agent holds full context (brief, operator profile/resume,
// the current stage's intent + gate + artifacts, accumulated facts/metrics/lessons)
// and can defend, concede, or refine its reasoning.
//
// Design notes (fixes from real use):
//   - Conversation replies are FREE TEXT (runAgent), never forced JSON — so a chatty
//     answer like "[remedy] ..." can't crash a JSON parser. Structured extraction of
//     a conclusion happens ONLY when the operator types /done, and even then it is
//     parsed defensively with a plain-text fallback.
//   - MULTI-LINE input: type as many lines/paragraphs as you want; submit with a lone
//     "." on its own line, or Ctrl-D. (Single Enter just adds a newline.)
//   - PERSIST + RESUME: every turn is appended to the idea's episodic memory tagged
//     "discuss". On restart, the prior discussion for the stage is reloaded so you
//     continue as if uninterrupted.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readMultiline } from "../lib/line-input.js";
import { log } from "../lib/log.js";
import type { ForgeConfig } from "../lib/types.js";
import { runAgent, extractJson } from "../lib/agent.js";
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

interface Conclusion {
  summary: string;
  factUpdates?: Record<string, unknown>;
  rerunStage?: string;
}

function loadStageArtifacts(ideaId: string, stageId: string): string {
  const names = listArtifacts(ideaId).filter((n) => n.startsWith(`${stageId}/`));
  const chunks: string[] = [];
  for (const n of names.slice(0, 8)) {
    const p = resolve(ideaPath(ideaId), "artifacts", n);
    if (existsSync(p)) chunks.push(`### ${n}\n${readFileSync(p, "utf8").slice(0, 4000)}`);
  }
  return chunks.join("\n\n") || "(no artifacts yet for this stage)";
}

/** Rebuild prior discussion turns for this stage from episodic memory (resume). */
function priorTurns(ideaId: string, stageId: string): Turn[] {
  const turns: Turn[] = [];
  for (const e of episodic(ideaId).all()) {
    if (e.stage !== stageId) continue;
    if (e.text.startsWith("operator (discuss): ")) turns.push({ role: "operator", text: e.text.slice("operator (discuss): ".length) });
    else if (e.text.startsWith("framework (discuss): ")) turns.push({ role: "framework", text: e.text.slice("framework (discuss): ".length) });
  }
  return turns;
}

const SYS = `You are the venture framework discussing a decision WITH the operator — a peer
conversation, not a lecture. You know their real background (resume-derived profile) and the
current stage's work. When the operator challenges a recommendation (e.g. "do I really need this
certification given my experience?"), reason honestly and specifically against THEIR profile:
concede when they're right, hold your ground with concrete reasoning when warranted, and quantify
trade-offs. Prefer leveraging credentials/experience the operator ALREADY has over acquiring new
ones, unless a buyer in this niche demonstrably requires the new credential. Be concise, direct,
and write in plain prose (no JSON, no preamble like "[answer]"). Just talk.`;

const FINALIZE_SYS = `You summarize a finished discussion into a single actionable conclusion.
Output STRICT JSON only, no prose around it:
{"summary":"<one-line decision reached>","factUpdates":{<facts to persist, may be empty>},"rerunStage":"<stage id to re-run to apply it, or omit>"}`;

/** Read a multi-line block: ENTER submits; Option/Alt+ENTER (or trailing "\") makes
 *  a newline. Returns null on Ctrl-C / EOF. */
async function readBlock(promptStr: string): Promise<string | null> {
  const r = await readMultiline(promptStr);
  return r.text;
}

export async function discussIdea(cfg: ForgeConfig, ideaId: string, opts: { stage?: string } = {}): Promise<void> {
  const idea = loadIdea(ideaId);
  if (!idea) { log.error("discuss", `No idea "${ideaId}".`); return; }
  const spec = loadIdeaSpec(ideaId);
  const stageId = opts.stage || idea.currentStage;
  const stage = spec.stages.find((s) => s.id === stageId);
  const profile = loadProfile();
  const profileBlock = profile ? profileSummary(profile) : "(no operator profile on file — run `forge venture profile` to derive one from the resume)";

  // RESUME: load any prior discussion for this stage.
  const history: Turn[] = priorTurns(ideaId, stageId);

  log.raw(`\n💬 Discussing idea "${idea.hint}" — stage: ${stage?.title ?? stageId}`);
  if (history.length) log.raw(`   (resumed — ${history.length} prior message(s) loaded from memory)`);
  log.raw(`   The framework has your brief, resume-derived profile, and this stage's work in context.`);
  log.raw(`   ENTER sends · Option/Alt+ENTER (or end a line with "\\") makes a new line · Ctrl-C to leave.`);
  log.raw(`   Commands: /done finish & propose conclusion · /stage <id> switch · /quit leave\n`);

  if (history.length) {
    log.raw("— conversation so far —");
    for (const t of history.slice(-6)) log.raw(`${t.role === "operator" ? "you" : "framework"} › ${t.text}\n`);
  }

  const baseContext =
    `IDEA: ${idea.hint}\n` +
    `STAGE IN FOCUS: ${stage?.title ?? stageId} (#${stageId})\n` +
    (stage ? `STAGE INTENT: ${stage.intent}\nSTAGE GATE: ${stage.gate.predicate} (advance: ${stage.gate.advance})\n` : "") +
    `\nOPERATOR PROFILE (their real means/credentials):\n${profileBlock}\n\n` +
    `KNOWN FACTS:\n${JSON.stringify(getFacts(ideaId), null, 2)}\n\n` +
    `CURRENT METRICS:\n${JSON.stringify(getMetrics(ideaId), null, 2)}\n\n` +
    `THIS STAGE'S ARTIFACTS:\n${stage ? loadStageArtifacts(ideaId, stageId) : "(n/a)"}\n`;

  while (true) {
    const msg = await readBlock("you › ");
    if (msg === null) { log.raw("\n(left discussion) — progress is saved; resume anytime with the same command."); return; }
    const trimmed = msg.trim();
    if (!trimmed) continue;

    if (trimmed === "/quit") { log.raw("Left the discussion. Conversation saved; nothing applied."); return; }
    if (trimmed === "/help") {
      log.raw('ENTER sends · Option/Alt+ENTER or trailing "\\" = newline · /done finish · /stage <id> switch · /quit leave');
      continue;
    }
    if (trimmed.startsWith("/stage")) {
      const newStage = trimmed.slice(6).trim();
      if (newStage && spec.stages.some((s) => s.id === newStage)) return discussIdea(cfg, ideaId, { stage: newStage });
      log.raw(`Stages: ${spec.stages.map((s) => s.id).join(", ")}`);
      continue;
    }

    const finishing = trimmed === "/done";
    if (!finishing) {
      history.push({ role: "operator", text: msg });
      episodic(ideaId).add(stageId, `operator (discuss): ${msg}`, "event");
    }

    const transcript = history.map((t) => `${t.role === "operator" ? "OPERATOR" : "FRAMEWORK"}: ${t.text}`).join("\n");

    if (finishing) {
      // Finalize: ask for a strict-JSON conclusion, parsed defensively.
      const res = await runAgent({
        cfg, model: cfg.models.lead, label: "loop:discuss-finalize",
        intent: "summarizing the discussion into a conclusion", systemPrompt: FINALIZE_SYS,
        allowedTools: [],
        prompt: `${baseContext}\n\nCONVERSATION:\n${transcript}\n\nProduce the conclusion JSON now.`,
      });
      recordSpend(cfg, res.costUsd);
      let conclusion: Conclusion | null = null;
      try { conclusion = extractJson<Conclusion>(res.text); } catch { /* fall back below */ }
      if (!conclusion || !conclusion.summary) {
        log.raw(`\nCouldn't extract a clean conclusion. The model said:\n${res.text.slice(0, 500)}\n`);
        log.raw("Keep talking to refine, or /quit to leave it recorded as-is.");
        continue;
      }
      log.raw(`\n— proposed conclusion —\n${conclusion.summary}`);
      if (conclusion.factUpdates && Object.keys(conclusion.factUpdates).length) log.raw(`facts to update: ${JSON.stringify(conclusion.factUpdates)}`);
      if (conclusion.rerunStage) log.raw(`would re-run stage: ${conclusion.rerunStage}`);
      const ans = (await askLine("\nApply this conclusion? [y]es apply+rerun / [r]ecord only / [n]o keep talking › ")).trim().toLowerCase();
      if (ans === "y" || ans === "yes") { await applyConclusion(cfg, ideaId, conclusion, { rerun: true }); return; }
      if (ans === "r" || ans === "record") { await applyConclusion(cfg, ideaId, conclusion, { rerun: false }); return; }
      log.raw("Okay — keep talking.");
      continue;
    }

    // Normal conversational turn — FREE TEXT, no JSON.
    const res = await runAgent({
      cfg, model: cfg.models.lead, label: "loop:discuss",
      intent: "discussing the decision with the operator", systemPrompt: SYS,
      allowedTools: ["WebSearch", "WebFetch"],
      prompt: `${baseContext}\n\nCONVERSATION SO FAR:\n${transcript}\n\nRespond to the operator's latest message in plain prose.`,
    });
    recordSpend(cfg, res.costUsd);
    const reply = (res.text ?? "").trim() || "(no reply)";
    log.raw(`\nframework › ${reply}\n`);
    history.push({ role: "framework", text: reply });
    episodic(ideaId).add(stageId, `framework (discuss): ${reply}`, "event");
  }
}

/** A one-shot single-line prompt (for short y/r/n confirmations). */
async function askLine(promptStr: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(promptStr);
  } finally {
    rl.close();
  }
}

async function applyConclusion(cfg: ForgeConfig, ideaId: string, conclusion: Conclusion, opts: { rerun: boolean }): Promise<void> {
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
    log.ok("discuss", `Conclusion recorded. Re-run when ready: npm run forge -- idea run ${ideaId}`);
  }
}
