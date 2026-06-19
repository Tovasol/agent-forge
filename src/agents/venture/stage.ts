// src/agents/venture/stage.ts
// Runs ONE pipeline stage: loads the stage's playbook skills, runs the stage
// agent to produce artifacts, persists them, and (at forks) produces a decision
// brief. Returns whether the stage completed and whether a gate must fire.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runAgentJson } from "../../lib/agent.js";
import { prompt } from "../../lib/prompts.js";
import { log } from "../../lib/log.js";
import type { ForgeConfig } from "../../lib/types.js";
import type { StageDef, VentureState, DecisionBrief } from "../../lib/venture-types.js";
import { STAGES } from "../../lib/stages.js";
import {
  saveVenture,
  journal,
  writeVentureArtifact,
  saveBrief,
  readVentureArtifacts,
} from "../../harness/venture-state.js";
import { recordSpend } from "../../harness/budget.js";
import { loadProfile } from "./profile.js";
import { profileSummary } from "../../lib/operator-types.js";

interface StageOut {
  artifacts: Array<{ name: string; content: string }>;
  summary: string;
  exitCriteriaMet: boolean;
  openItems: string[];
  preparedForGate: string;
}

function loadSkills(def: StageDef): string {
  if (!def.skills.length) return "";
  const dir = resolve(process.cwd(), "skills");
  const parts: string[] = [];
  for (const s of def.skills) {
    const p = resolve(dir, `${s}.md`);
    if (existsSync(p)) parts.push(readFileSync(p, "utf8"));
  }
  return parts.length ? "\n\nPLAYBOOK SKILLS FOR THIS STAGE:\n" + parts.join("\n\n---\n\n") : "";
}

function priorContext(v: VentureState): string {
  // Feed the most relevant prior artifacts so each stage builds on the last.
  const arts = readVentureArtifacts();
  const names = Object.keys(arts);
  if (!names.length) return "";
  // Keep it bounded: include up to ~6 most recent artifacts, truncated.
  const recent = names.slice(-6);
  return (
    "\n\nPRIOR ARTIFACTS (build on these, don't repeat them):\n" +
    recent.map((n) => `### ${n}\n${arts[n].slice(0, 1500)}`).join("\n\n")
  );
}

export async function runStage(
  cfg: ForgeConfig,
  v: VentureState,
  def: StageDef
): Promise<{ completed: boolean; openItems: string[]; preparedForGate: string }> {
  const rec = v.stages[def.id];
  rec.status = "in-progress";
  rec.startedAt = rec.startedAt ?? new Date().toISOString();
  v.currentStage = def.id;
  saveVenture(v);
  journal(v, def.id, `Started: ${def.title}`);

  const profile = loadProfile();
  const profileBlock = profile ? "\n\n" + profileSummary(profile) + "\n" : "";

  const ask =
    `VENTURE HINT: ${v.hint}\n` +
    `AFFORDABLE-LOSS CEILING: $${v.affordableLossUsd}\n` +
    profileBlock +
    `\nSTAGE: ${def.title}\nGOAL: ${def.goal}\n` +
    `KEY QUESTIONS:\n${def.keyQuestions.map((q) => `  - ${q}`).join("\n")}\n` +
    `REQUIRED ARTIFACTS: ${def.artifacts.join(", ")}\n` +
    `EXIT CRITERIA: ${def.exitCriteria}` +
    loadSkills(def) +
    priorContext(v) +
    "\n\nExecute this stage now. Return ONLY the stage JSON.";

  let out: StageOut;
  try {
    const res = await runAgentJson<StageOut>({
      cfg,
      model: cfg.models.lead,
      systemPrompt: prompt("stage-runner"),
      permissionMode: "plan",
      allowedTools: ["WebSearch", "WebFetch", "Read", "Glob", "Grep"],
      prompt: ask,
    });
    out = res.data;
    recordSpend(cfg, res.meta.costUsd);
  } catch (e) {
    rec.status = "pending";
    rec.notes.push(`Stage failed: ${(e as Error).message}`);
    saveVenture(v);
    log.error("stage", `${def.id} failed: ${(e as Error).message}`);
    return { completed: false, openItems: [(e as Error).message], preparedForGate: "" };
  }

  // Persist artifacts.
  for (const a of out.artifacts ?? []) {
    const path = writeVentureArtifact(def.id, a.name, a.content);
    rec.artifacts.push(path);
  }
  rec.notes.push(out.summary ?? "");

  // At a strategic fork, also produce a decision brief from the artifacts.
  if (def.gateOnComplete === "strategic") {
    await produceBrief(cfg, v, def);
  }

  rec.status = out.exitCriteriaMet ? "complete" : "in-progress";
  if (out.exitCriteriaMet) rec.completedAt = new Date().toISOString();
  saveVenture(v);
  journal(v, def.id, out.exitCriteriaMet ? `Completed: ${out.summary}` : `Incomplete: ${out.openItems?.join("; ")}`);
  log.ok("stage", `${def.id}: ${out.summary?.slice(0, 120) ?? "done"}`);

  return {
    completed: !!out.exitCriteriaMet,
    openItems: out.openItems ?? [],
    preparedForGate: out.preparedForGate ?? "",
  };
}

async function produceBrief(cfg: ForgeConfig, v: VentureState, def: StageDef) {
  const arts = readVentureArtifacts();
  const relevant = Object.entries(arts)
    .filter(([n]) => n.startsWith(def.id) || n.includes("segments") || n.includes("jtbd") || n.includes("value"))
    .map(([n, c]) => `### ${n}\n${c.slice(0, 2500)}`)
    .join("\n\n");

  try {
    const res = await runAgentJson<Omit<DecisionBrief, "id" | "stage" | "createdAt">>({
      cfg,
      model: cfg.models.lead,
      systemPrompt: prompt("decision-brief"),
      permissionMode: "plan",
      allowedTools: ["WebSearch", "WebFetch"],
      prompt:
        `Produce a decision brief for the "${def.title}" choice in this venture.\n\n` +
        `HINT: ${v.hint}\n\nARTIFACTS:\n${relevant}\n\nReturn ONLY the decision-brief JSON.`,
    });
    recordSpend(cfg, res.meta.costUsd);
    const brief: DecisionBrief = {
      id: `brief-${def.id}-${Date.now().toString(36)}`,
      stage: def.id,
      createdAt: new Date().toISOString(),
      ...res.data,
    } as DecisionBrief;
    const path = saveBrief(brief);
    v.stages[def.id].decisionBriefIds.push(brief.id);
    v.stages[def.id].artifacts.push(path);
    saveVenture(v);
    log.info("brief", `Decision brief for ${def.id}: recommends "${brief.recommendation}"`);
  } catch (e) {
    log.warn("brief", `Could not produce decision brief for ${def.id}: ${(e as Error).message}`);
  }
}
