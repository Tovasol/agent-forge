// src/harness/status.ts
// Maintains memory/status.json — a live snapshot of where the engine is: the
// current phase, the research fan-out tree (each facet + its state), recent
// activity, and run totals. The `forge dash` viewer reads this to render a live
// dashboard WITHOUT being coupled to the engine process (attach/detach anytime).

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

export type FacetState = "planned" | "researching" | "done" | "failed";

export interface FacetStatus {
  id: string;
  title: string;
  state: FacetState;
  claims?: number;
  searches?: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface EngineStatus {
  phase: string;
  startedAt: string;
  updatedAt: string;
  facets: FacetStatus[];
  activity: string[]; // ring buffer of recent activity lines
  spendUsd: number;
  note: string;
}

const PATH = resolve(process.cwd(), "memory/status.json");
const MAX_ACTIVITY = 60;

function read(): EngineStatus {
  if (existsSync(PATH)) {
    try {
      return JSON.parse(readFileSync(PATH, "utf8")) as EngineStatus;
    } catch {
      /* fall through to fresh */
    }
  }
  return {
    phase: "idle",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    facets: [],
    activity: [],
    spendUsd: 0,
    note: "",
  };
}

function write(s: EngineStatus) {
  s.updatedAt = new Date().toISOString();
  try {
    mkdirSync(dirname(PATH), { recursive: true });
    writeFileSync(PATH, JSON.stringify(s, null, 2));
  } catch {
    /* best-effort */
  }
}

export const status = {
  start(phase: string, note = "") {
    const s = read();
    // New phase: clear the research fan-out tree unless we're (re)entering research.
    if (s.phase !== phase && !phase.startsWith("research")) s.facets = [];
    s.phase = phase;
    s.startedAt = new Date().toISOString();
    s.note = note;
    write(s);
  },
  setFacets(facets: Array<{ id: string; title: string }>) {
    const s = read();
    const existing = new Map(s.facets.map((f) => [f.id, f]));
    s.facets = facets.map((f) => existing.get(f.id) ?? { id: f.id, title: f.title, state: "planned" });
    write(s);
  },
  addFacet(f: { id: string; title: string }) {
    const s = read();
    if (!s.facets.some((x) => x.id === f.id)) {
      s.facets.push({ id: f.id, title: f.title, state: "planned" });
      write(s);
    }
  },
  facet(id: string, patch: Partial<FacetStatus>) {
    const s = read();
    const f = s.facets.find((x) => x.id === id);
    if (f) {
      Object.assign(f, patch);
      write(s);
    }
  },
  bumpSearch(id: string) {
    const s = read();
    const f = s.facets.find((x) => x.id === id);
    if (f) {
      f.searches = (f.searches ?? 0) + 1;
      write(s);
    }
  },
  activity(line: string) {
    const s = read();
    s.activity.push(`${new Date().toISOString().slice(11, 19)}  ${line}`);
    if (s.activity.length > MAX_ACTIVITY) s.activity = s.activity.slice(-MAX_ACTIVITY);
    write(s);
  },
  spend(total: number) {
    const s = read();
    s.spendUsd = total;
    write(s);
  },
  note(n: string) {
    const s = read();
    s.note = n;
    write(s);
  },
  snapshot(): EngineStatus {
    return read();
  },
  path() {
    return PATH;
  },
};
