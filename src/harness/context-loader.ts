// src/harness/context-loader.ts
// Reads operator context files (resumes, CVs, an assets description) from the
// `context/` directory and extracts their text. Supports PDF, DOCX, and
// plain/markdown text. PDF/DOCX parsers are imported dynamically so the rest of
// the framework runs even if those optional deps aren't installed yet.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";

export interface LoadedDoc {
  path: string;
  kind: "resume" | "assets" | "other";
  text: string;
}

const CONTEXT_DIR = resolve(process.cwd(), "context");

async function extractPdf(abs: string): Promise<string> {
  try {
    // @ts-ignore optional dep
    const mod = await import("pdf-parse");
    const pdf = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
    const data = await pdf(readFileSync(abs));
    return data.text ?? "";
  } catch (e) {
    return `[could not parse PDF ${abs}: install pdf-parse — ${(e as Error).message}]`;
  }
}

async function extractDocx(abs: string): Promise<string> {
  try {
    // @ts-ignore optional dep
    const mammoth = await import("mammoth");
    const m = (mammoth.default ?? mammoth) as { extractRawText: (o: { path: string }) => Promise<{ value: string }> };
    const res = await m.extractRawText({ path: abs });
    return res.value ?? "";
  } catch (e) {
    return `[could not parse DOCX ${abs}: install mammoth — ${(e as Error).message}]`;
  }
}

function classify(name: string): LoadedDoc["kind"] {
  const n = name.toLowerCase();
  if (n.includes("resume") || n.includes("cv")) return "resume";
  if (n.includes("asset") || n.includes("ownership") || n.includes("service") || n.includes("have")) return "assets";
  return "other";
}

/** Load and extract all context files. Returns [] if the dir is absent/empty. */
export async function loadContext(): Promise<LoadedDoc[]> {
  if (!existsSync(CONTEXT_DIR)) return [];
  const out: LoadedDoc[] = [];
  for (const name of readdirSync(CONTEXT_DIR)) {
    if (name.startsWith(".")) continue;
    const abs = resolve(CONTEXT_DIR, name);
    if (!statSync(abs).isFile()) continue;
    const ext = extname(name).toLowerCase();
    let text = "";
    if (ext === ".pdf") text = await extractPdf(abs);
    else if (ext === ".docx") text = await extractDocx(abs);
    else if (ext === ".txt" || ext === ".md" || ext === ".markdown" || ext === ".text") text = readFileSync(abs, "utf8");
    else continue; // skip unknown types (e.g. images, .doc)
    if (text.trim()) out.push({ path: `context/${name}`, kind: classify(name), text: text.trim() });
  }
  return out;
}

export function contextDirExists(): boolean {
  return existsSync(CONTEXT_DIR) && readdirSync(CONTEXT_DIR).some((f) => !f.startsWith("."));
}
