// src/harness/loop-discuss2.ts
// TOPIC-SCOPED discussion — the new, cost-aware sibling of loop-discuss.ts.
//
// What's different from `discuss` (and why):
//   1. PER-TOPIC LOGS, not one stage-wide transcript. Each decision is its own
//      bounded conversation (its own cold log). Unrelated decisions no longer
//      pile into one transcript that's re-sent every turn — that monolith was
//      the source of the quadratic cost we hit this session.
//   2. HOT CONTEXT, not cold replay. On entry we inject only the distilled
//      CONCLUSIONS of prior topics (a few lines each), so past *decisions* guide
//      a new discussion without re-sending past *transcripts*.
//   3. /conclude IS A CONVERSATION. Concluding drafts a structured record
//      (decision + load-bearing reasons + rejected alternatives + constraints +
//      a pointer back to the full log), shows it to you, and lets you negotiate
//      it ("no — the real reason was X") until you /accept. Only then is it
//      sealed into the hot conclusions file.
//
// Built PARALLEL to `discuss`: this file adds behavior beside the original and
// touches none of it. Once proven, it can take over the `discuss` name.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, env } from "node:process";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
} from "./loop-memory.js";
import { runIdeaLoop, pivotIdea } from "./loop-executor.js";
import {
  slugifyTopic,
  topicLogName,
  newSessionId,
  isSessionId,
  appendTurn,
  readTurns,
  listTopics,
  listUnconcludedSessions,
  loadConclusions,
  recordConclusion,
  conclusionsContext,
  type Conclusion,
  type DiscussTurn,
} from "./discuss-store.js";

interface Turn {
  role: "operator" | "framework";
  text: string;
}

/** The structured draft the model proposes at /conclude time (pre-acceptance). */
interface ConclusionDraft {
  topic: string; // inferred human title for this decision (operator confirms)
  decision: string;
  reasons: string[];
  rejected: string[];
  constraints: string[];
  factUpdates?: Record<string, unknown>;
  rerunStage?: string;
}

const SYS = `You are the venture framework discussing ONE decision WITH the operator — a peer
conversation, not a lecture. You know their real background (resume-derived profile), the
current stage's work, and the decisions already concluded on other topics (given as context).
Stay on THIS topic. When the operator challenges a recommendation, reason honestly and
specifically against THEIR profile: concede when they're right, hold your ground with concrete
reasoning when warranted, and quantify trade-offs. Prefer leveraging credentials/experience the
operator ALREADY has over acquiring new ones, unless a buyer in this niche demonstrably requires
the new credential. Be concise, direct, plain prose (no JSON, no "[answer]" preamble). Just talk.`;

const DRAFT_SYS = `You distill a finished discussion into a SUFFICIENT (not lossless) conclusion the
operator will negotiate before it's saved. The conversation may have started with no fixed topic
and drifted — so FIRST infer a short human "topic" title (3-6 words) naming the decision this
discussion actually settled. Then capture only what's load-bearing: the decision, the 2-4 reasons
that would FLIP the decision if they turned out wrong, the alternatives considered and rejected
(with why), and any new binding constraints introduced. Omit restatement and pleasantries.
Output STRICT JSON only, no prose around it:
{"topic":"<short title naming the decision>","decision":"<one-line decision reached>","reasons":["..."],"rejected":["..."],"constraints":["..."],"factUpdates":{},"rerunStage":"<stage id or omit>"}`;

/** Rebuild the live conversation array from a topic's cold log (resume). */
function priorTurns(ideaId: string, slug: string): Turn[] {
  return readTurns(ideaId, slug).map((t: DiscussTurn) => ({ role: t.role, text: t.text }));
}

async function readBlock(promptStr: string): Promise<string | null> {
  const r = await readMultiline(promptStr);
  return r.text;
}

async function askLine(promptStr: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(promptStr);
  } finally {
    rl.close();
  }
}

// ── $EDITOR-backed draft editing ─────────────────────────────────────────────
// The operator can hand-edit a draft directly instead of describing corrections
// in prose. We render the draft to a human-friendly, commented text buffer, open
// it in $EDITOR, then parse the saved buffer back into a draft. The saved buffer
// IS the conclusion — no model round-trip. Parsing is forgiving: section headers
// drive it, blank/`#`-comment lines are ignored, list items are `- ` prefixed.

const EDIT_TEMPLATE = (d: ConclusionDraft) =>
  [
    "# Edit this conclusion, then save & close your editor.",
    "# Lines starting with '#' are ignored. Keep the SECTION headers.",
    "# Under list sections, one item per '- ' line. Leave a section empty to clear it.",
    "",
    "TOPIC:",
    d.topic || "",
    "",
    "DECISION:",
    d.decision || "",
    "",
    "REASONS:",
    ...(d.reasons?.length ? d.reasons.map((r) => `- ${r}`) : ["- "]),
    "",
    "REJECTED:",
    ...(d.rejected?.length ? d.rejected.map((r) => `- ${r}`) : ["- "]),
    "",
    "CONSTRAINTS:",
    ...(d.constraints?.length ? d.constraints.map((r) => `- ${r}`) : ["- "]),
    "",
    "RERUN_STAGE:",
    d.rerunStage || "",
    "",
  ].join("\n");

/** Parse the saved editor buffer back into a draft (forgiving, header-driven). */
function parseEditedDraft(text: string, base: ConclusionDraft): ConclusionDraft {
  const sections: Record<string, string[]> = {
    TOPIC: [],
    DECISION: [],
    REASONS: [],
    REJECTED: [],
    CONSTRAINTS: [],
    RERUN_STAGE: [],
  };
  let cur: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/g, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const header = line.match(/^([A-Z_]+):\s*$/);
    if (header && header[1] in sections) {
      cur = header[1];
      continue;
    }
    if (!cur) continue;
    sections[cur].push(line);
  }
  const scalar = (k: string) => sections[k].join(" ").trim();
  const list = (k: string) =>
    sections[k]
      .map((l) => l.replace(/^\s*-\s?/, "").trim())
      .filter(Boolean);
  return {
    topic: scalar("TOPIC") || base.topic,
    decision: scalar("DECISION") || base.decision,
    reasons: list("REASONS"),
    rejected: list("REJECTED"),
    constraints: list("CONSTRAINTS"),
    factUpdates: base.factUpdates, // structured facts aren't hand-edited here
    rerunStage: scalar("RERUN_STAGE") || undefined,
  };
}

/**
 * Open the draft in $EDITOR for direct surgery. Returns the edited draft, or
 * null if $EDITOR is unset or the editor failed (caller falls back to the
 * conversational edit path).
 */
function editDraftInEditor(draft: ConclusionDraft): ConclusionDraft | null {
  const editor = env.VISUAL || env.EDITOR;
  if (!editor) return null;
  let file = "";
  try {
    const dir = mkdtempSync(join(tmpdir(), "forge-conclude-"));
    file = join(dir, "conclusion.txt");
    writeFileSync(file, EDIT_TEMPLATE(draft));
    const [cmd, ...preArgs] = editor.split(/\s+/);
    const r = spawnSync(cmd, [...preArgs, file], { stdio: "inherit" });
    if (r.status !== 0 && r.status !== null) {
      log.raw(`($EDITOR "${editor}" exited ${r.status} — keeping the unedited draft.)`);
      return draft;
    }
    const edited = parseEditedDraft(readFileSync(file, "utf8"), draft);
    if (!edited.decision.trim()) {
      log.raw("(Edited draft has no DECISION — discarding the edit.)");
      return draft;
    }
    return edited;
  } catch (e) {
    log.raw(`(Couldn't open $EDITOR: ${(e as Error).message}. Falling back.)`);
    return null;
  } finally {
    if (file) {
      try {
        unlinkSync(file);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/** Resolve which cold-log session to open (resume an existing one, or mint new).
 *  Topic is OPTIONAL at start: conversations drift, so we name the session by a
 *  machine id and infer the human topic only at /conclude time.
 *  - opts.topic given → treat as an explicit override (resume if a log already
 *    exists under its slug, else start a new session pre-labelled with it).
 *  - no topic → list unconcluded sessions (id + first-line preview); operator
 *    picks one to resume or presses ENTER to start a fresh session. */
async function resolveSession(
  ideaId: string,
  topic?: string
): Promise<{ sessionId: string; title?: string }> {
  const explicit = (topic ?? "").trim();
  if (explicit) {
    const slug = slugifyTopic(explicit);
    // Resume a pre-existing slug-named log if present; else a fresh session.
    const sessionId = listTopics(ideaId).includes(slug) ? slug : newSessionId();
    return { sessionId, title: explicit };
  }

  const open = listUnconcludedSessions(ideaId);
  if (open.length) {
    log.raw("Unconcluded discussions for this idea (most recent first):");
    open.forEach((s, i) => {
      log.raw(`  [${i + 1}] ${s.id}  (${s.turnCount} msg)  — ${s.preview}`);
    });
    log.raw("Enter a number to resume, or press ENTER to start a fresh discussion.");
    const pick = (await askLine("resume # › ")).trim();
    const n = Number(pick);
    if (pick && Number.isInteger(n) && n >= 1 && n <= open.length) {
      const chosen = open[n - 1];
      return { sessionId: chosen.id, title: chosen.isSession ? undefined : chosen.id };
    }
  }
  // Fresh, unlabelled session — topic inferred at /conclude.
  return { sessionId: newSessionId(), title: undefined };
}

/**
 * Topic-scoped discussion. `opts.topic` is an OPTIONAL human title; when omitted
 * the session opens unlabelled under a machine id and the topic is inferred at
 * /conclude time. `opts.sessionId` resumes a specific cold log directly.
 */
export async function discussTopic(
  cfg: ForgeConfig,
  ideaId: string,
  opts: { topic?: string; stage?: string; sessionId?: string } = {}
): Promise<void> {
  const idea = loadIdea(ideaId);
  if (!idea) {
    log.error("discuss2", `No idea "${ideaId}".`);
    return;
  }
  const spec = loadIdeaSpec(ideaId);
  const stageId = opts.stage || idea.currentStage;
  const stage = spec.stages.find((s) => s.id === stageId);
  const profile = loadProfile();
  const profileBlock = profile
    ? profileSummary(profile)
    : "(no operator profile on file — run `forge venture profile` to derive one from the resume)";

  // Resolve the session (machine id is the log key). Topic is provisional.
  let sessionId: string;
  let title: string | undefined;
  if (opts.sessionId) {
    sessionId = opts.sessionId;
    title = isSessionId(sessionId) ? opts.topic?.trim() || undefined : sessionId;
  } else {
    const r = await resolveSession(ideaId, opts.topic);
    sessionId = r.sessionId;
    title = r.title;
  }

  // RESUME: load this session's prior turns (only this session — not the stage).
  const history: Turn[] = priorTurns(ideaId, sessionId);

  // HOT CONTEXT: distilled conclusions of OTHER topics (a few lines each).
  const decisionsBlock = conclusionsContext(ideaId);

  const label = title ?? "(untitled — topic set at /conclude)";
  log.raw(`\n💬 Discussion ${label}  [${sessionId}]  — idea "${idea.hint}" · stage ${stage?.title ?? stageId}`);
  if (history.length) log.raw(`   (resumed — ${history.length} prior message(s) in this discussion)`);
  log.raw(`   Prior concluded decisions are loaded as context; this discussion's own log is separate.`);
  log.raw(`   ENTER sends · Option/Alt+ENTER (or trailing "\\") = newline · Ctrl-C to leave.`);
  log.raw(`   Commands: /conclude draft+save a decision · /stage <id> switch · /quit leave\n`);

  if (history.length) {
    log.raw("— this discussion so far —");
    for (const t of history.slice(-6)) log.raw(`${t.role === "operator" ? "you" : "framework"} › ${t.text}\n`);
  }

  const baseContext =
    `IDEA: ${idea.hint}\n` +
    `TOPIC IN FOCUS: ${title ?? "(not yet named — will be inferred when concluding)"}\n` +
    `STAGE: ${stage?.title ?? stageId} (#${stageId})\n` +
    (stage ? `STAGE INTENT: ${stage.intent}\nSTAGE GATE: ${stage.gate.predicate} (advance: ${stage.gate.advance})\n` : "") +
    `\nOPERATOR PROFILE (their real means/credentials):\n${profileBlock}\n\n` +
    `DECISIONS ALREADY CONCLUDED (hot context — honor these):\n${decisionsBlock}\n\n` +
    `KNOWN FACTS:\n${JSON.stringify(getFacts(ideaId), null, 2)}\n\n` +
    `CURRENT METRICS:\n${JSON.stringify(getMetrics(ideaId), null, 2)}\n`;

  while (true) {
    const msg = await readBlock("you › ");
    if (msg === null) {
      log.raw("\n(left discussion) — the log is saved; resume it from the `topics` list anytime.");
      return;
    }
    const trimmed = msg.trim();
    if (!trimmed) continue;

    if (trimmed === "/quit") {
      log.raw("Left the discussion. Log saved; no conclusion recorded.");
      return;
    }
    if (trimmed === "/help") {
      log.raw('ENTER sends · Option/Alt+ENTER or trailing "\\" = newline · /conclude · /stage <id> · /quit');
      continue;
    }
    if (trimmed.startsWith("/stage")) {
      const newStage = trimmed.slice(6).trim();
      if (newStage && spec.stages.some((s) => s.id === newStage))
        return discussTopic(cfg, ideaId, { sessionId, topic: title, stage: newStage });
      log.raw(`Stages: ${spec.stages.map((s) => s.id).join(", ")}`);
      continue;
    }

    if (trimmed === "/conclude") {
      const concluded = await concludeFlow(cfg, ideaId, { title, sessionId, stageId, history, baseContext });
      if (concluded) return; // saved (and possibly applied) — leave the discussion
      continue; // operator chose to keep talking
    }

    // Normal turn — persist to THIS session's cold log, then reply.
    history.push({ role: "operator", text: msg });
    appendTurn(ideaId, sessionId, { role: "operator", text: msg });

    const transcript = history.map((t) => `${t.role === "operator" ? "OPERATOR" : "FRAMEWORK"}: ${t.text}`).join("\n");
    const res = await runAgent({
      cfg,
      model: cfg.models.lead,
      label: "loop:discuss2",
      intent: "discussing one decision with the operator",
      systemPrompt: SYS,
      allowedTools: ["WebSearch", "WebFetch"],
      prompt: `${baseContext}\n\nTHIS TOPIC SO FAR:\n${transcript}\n\nRespond to the operator's latest message in plain prose.`,
    });
    recordSpend(cfg, res.costUsd);
    const reply = (res.text ?? "").trim() || "(no reply)";
    log.raw(`\nframework › ${reply}\n`);
    history.push({ role: "framework", text: reply });
    appendTurn(ideaId, sessionId, { role: "framework", text: reply });
  }
}

/**
 * The /conclude sub-conversation: draft → review → negotiate → accept.
 * Returns true if a conclusion was saved (caller should leave the topic),
 * false if the operator chose to keep talking.
 */
async function concludeFlow(
  cfg: ForgeConfig,
  ideaId: string,
  ctx: { title?: string; sessionId: string; stageId: string; history: Turn[]; baseContext: string }
): Promise<boolean> {
  // The working draft. We (re)generate it from the model, but [e]dit replaces it
  // with the operator's hand-edited version directly (no model round-trip).
  let draft: ConclusionDraft | null = null;

  while (true) {
    // Generate a draft only when we don't already have one (e.g. after a
    // conversational [r]egenerate, or on first entry). A hand-edited draft is
    // kept as-is for re-display.
    if (!draft) {
      const transcript = ctx.history.map((t) => `${t.role === "operator" ? "OPERATOR" : "FRAMEWORK"}: ${t.text}`).join("\n");
      const res = await runAgent({
        cfg,
        model: cfg.models.lead,
        label: "loop:discuss2-conclude",
        intent: "drafting a conclusion for review",
        systemPrompt: DRAFT_SYS,
        allowedTools: [],
        prompt: `${ctx.baseContext}\n\nTHIS TOPIC:\n${transcript}\n\nProduce the conclusion JSON now.`,
      });
      recordSpend(cfg, res.costUsd);
      try {
        draft = extractJson<ConclusionDraft>(res.text);
      } catch {
        draft = null;
      }
      if (!draft || !draft.decision) {
        log.raw(`\nCouldn't draft a clean conclusion. The model said:\n${res.text.slice(0, 400)}\n`);
        log.raw("Keep talking to sharpen it, or /quit to leave without concluding.");
        return false;
      }
      // Seed the inferred topic with the explicit title if the operator gave one.
      if (ctx.title && !draft.topic) draft.topic = ctx.title;
    }

    // Show the draft.
    log.raw(`\n— proposed conclusion —`);
    log.raw(`topic:       ${draft.topic || "(unnamed)"}`);
    log.raw(`decision:    ${draft.decision}`);
    if (draft.reasons?.length) log.raw(`because:     ${draft.reasons.map((r) => `\n  - ${r}`).join("")}`);
    if (draft.rejected?.length) log.raw(`rejected:    ${draft.rejected.map((r) => `\n  - ${r}`).join("")}`);
    if (draft.constraints?.length) log.raw(`constraints: ${draft.constraints.map((r) => `\n  - ${r}`).join("")}`);
    if (draft.factUpdates && Object.keys(draft.factUpdates).length) log.raw(`facts:       ${JSON.stringify(draft.factUpdates)}`);
    if (draft.rerunStage) log.raw(`would re-run: ${draft.rerunStage}`);
    log.raw(`\nFull discussion is preserved at discussions/${topicLogName(ctx.sessionId)} (linked from the saved conclusion).`);

    const ans = (
      await askLine(
        "\n[a]ccept & save · accept+rerun [s]tage · [e]dit in $EDITOR · [r]egenerate (tell me what's wrong) · [k]eep talking › "
      )
    )
      .trim()
      .toLowerCase();

    if (ans === "a" || ans === "accept" || ans === "s" || ans === "stage") {
      const rerun = ans === "s" || ans === "stage";
      // Confirm / rename the topic label before sealing it into the hot file.
      const suggested = draft.topic || ctx.title || "";
      const chosen = (await askLine(`topic label [${suggested}] › `)).trim() || suggested;
      if (!chosen) {
        log.raw("A topic label is required to save — try again.");
        continue;
      }
      draft.topic = chosen;
      saveConclusion(ideaId, { sessionId: ctx.sessionId, stageId: ctx.stageId, history: ctx.history }, draft);
      if (rerun && draft.rerunStage) {
        log.info("discuss2", `Re-opening and re-running "${draft.rerunStage}" to apply the decision…`);
        pivotIdea(ideaId, draft.rerunStage);
        await runIdeaLoop(cfg, ideaId);
      } else {
        log.ok("discuss2", `Conclusion saved to the hot conclusions file. Future sessions load it automatically.`);
      }
      return true;
    }

    if (ans === "e" || ans === "edit") {
      // Direct surgery in $EDITOR — the saved buffer IS the conclusion.
      const edited = editDraftInEditor(draft);
      if (edited) {
        draft = edited; // re-display the hand-edited draft (no model call)
        continue;
      }
      // $EDITOR unset/failed → fall back to the conversational correction path.
      log.raw("($EDITOR unavailable — describe the correction instead.)");
      const fix = await readBlock("what's wrong / what should it say › ");
      if (fix && fix.trim()) {
        ctx.history.push({ role: "operator", text: `[conclude correction] ${fix.trim()}` });
        appendTurn(ideaId, ctx.sessionId, { role: "operator", text: `[conclude correction] ${fix.trim()}` });
        draft = null; // force a fresh model draft incorporating the correction
      }
      continue;
    }

    if (ans === "r" || ans === "regenerate") {
      // Conversational redraft: the operator's correction enters the log and the
      // model produces a new draft that incorporates it.
      const fix = await readBlock("what's wrong / what should it say › ");
      if (fix && fix.trim()) {
        ctx.history.push({ role: "operator", text: `[conclude correction] ${fix.trim()}` });
        appendTurn(ideaId, ctx.sessionId, { role: "operator", text: `[conclude correction] ${fix.trim()}` });
      }
      draft = null; // regenerate from the model
      continue;
    }

    // keep talking
    log.raw("Okay — keep talking; /conclude again when ready.");
    return false;
  }
}

function saveConclusion(
  ideaId: string,
  ctx: { sessionId: string; stageId: string; history: Turn[] },
  draft: ConclusionDraft
): void {
  const slug = slugifyTopic(draft.topic);
  const c: Conclusion = {
    id: `${slug}-${Date.now().toString(36)}`,
    topic: draft.topic,
    slug,
    session: ctx.sessionId,
    stage: ctx.stageId,
    status: "concluded",
    decision: draft.decision,
    reasons: draft.reasons ?? [],
    rejected: draft.rejected ?? [],
    constraints: draft.constraints ?? [],
    log: topicLogName(ctx.sessionId),
    concludedAt: new Date().toISOString(),
    turnCount: ctx.history.length,
    factUpdates: draft.factUpdates,
    rerunStage: draft.rerunStage,
  };
  recordConclusion(ideaId, c);

  // Mirror into the existing memory layers so the rest of the framework sees it:
  //  - durable fact (a one-liner keyed by topic) for gate/agent context
  //  - episodic verdict (timeline) with a pointer to the cold log
  setFact(ideaId, `decision_${slug}`, draft.decision);
  if (draft.factUpdates) {
    for (const [k, v] of Object.entries(draft.factUpdates)) setFact(ideaId, k, v);
  }
  episodic(ideaId).add(
    ctx.stageId,
    `DISCUSSION CONCLUSION [${slug}]: ${draft.decision} (full log: discussions/${topicLogName(ctx.sessionId)})`,
    "verdict"
  );
}

/**
 * `topics` helper: two sections —
 *   OPEN  — unconcluded sessions you can resume, by machine id + first-line
 *           preview (you pick by content, not by remembering a slug).
 *   DONE  — concluded decisions (the hot file), one line each.
 */
export function reportTopics(ideaId: string): void {
  const open = listUnconcludedSessions(ideaId);
  const concluded = loadConclusions(ideaId)
    .filter((c) => c.status === "concluded")
    .sort((a, b) => b.concludedAt.localeCompare(a.concludedAt));

  if (!open.length && !concluded.length) {
    log.raw('No discussions yet. Start one: npm run forge -- idea discuss2 <id>   (topic optional)');
    return;
  }

  if (open.length) {
    log.raw(`Open (resumable) discussions for idea ${ideaId}:`);
    open.forEach((s, i) => {
      log.raw(`  [${i + 1}] · ${s.id}  (${s.turnCount} msg)  — ${s.preview}`);
    });
    log.raw(`  resume one: npm run forge -- idea discuss2 ${ideaId}   (then pick its number)`);
  }

  if (concluded.length) {
    log.raw(`\nConcluded decisions for idea ${ideaId}:`);
    for (const c of concluded) {
      log.raw(`  ✓ [${c.slug}] ${c.decision}`);
      log.raw(`      log: discussions/${c.log}`);
    }
  }
}
