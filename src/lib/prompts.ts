// src/lib/prompts.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), "prompts");

export function prompt(name: string): string {
  return readFileSync(resolve(DIR, `${name}.md`), "utf8");
}
