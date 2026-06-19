// src/lib/gate-eval.ts
// A tiny, SAFE boolean expression evaluator for gate predicates. We deliberately
// do NOT use eval()/Function() — predicates come from a versioned spec that the
// meta-loop can edit, so arbitrary code execution would be a security and
// objective-hacking risk. This is a minimal recursive-descent parser supporting:
//   - identifiers (looked up in the MetricsBag; undefined => false/0)
//   - number and boolean literals
//   - comparisons: > >= < <= == !=
//   - boolean ops: && || !  and parentheses
// Example: "paying_clients >= 3 && wtp_confirmed"  or  "ltgp_cac_ratio >= 6 || default_alive"

import type { MetricsBag } from "./loop-schema.js";

type Tok = { t: "num" | "bool" | "id" | "op" | "lp" | "rp"; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const two = ["&&", "||", ">=", "<=", "==", "!="];
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === "(") { toks.push({ t: "lp", v: "(" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rp", v: ")" }); i++; continue; }
    const pair = src.slice(i, i + 2);
    if (two.includes(pair)) { toks.push({ t: "op", v: pair }); i += 2; continue; }
    if (c === ">" || c === "<" || c === "!") { toks.push({ t: "op", v: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let n = "";
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      toks.push({ t: "num", v: n });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let id = "";
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) id += src[i++];
      if (id === "true" || id === "false") toks.push({ t: "bool", v: id });
      else toks.push({ t: "id", v: id });
      continue;
    }
    throw new Error(`gate predicate: unexpected character '${c}' in "${src}"`);
  }
  return toks;
}

// Recursive descent: or := and ('||' and)* ; and := cmp ('&&' cmp)* ;
// cmp := unary (('>'|'>='|'<'|'<='|'=='|'!=') unary)? ; unary := '!' unary | primary ;
// primary := num | bool | id | '(' or ')'
class Parser {
  private p = 0;
  constructor(private toks: Tok[], private bag: MetricsBag) {}

  private peek(): Tok | undefined { return this.toks[this.p]; }
  private next(): Tok | undefined { return this.toks[this.p++]; }

  parse(): boolean {
    const v = this.or();
    if (this.p !== this.toks.length) throw new Error("gate predicate: trailing tokens");
    return this.toBool(v);
  }

  private or(): number | boolean {
    let left = this.and();
    while (this.peek()?.v === "||") { this.next(); const r = this.and(); left = this.toBool(left) || this.toBool(r); }
    return left;
  }
  private and(): number | boolean {
    let left = this.cmp();
    while (this.peek()?.v === "&&") { this.next(); const r = this.cmp(); left = this.toBool(left) && this.toBool(r); }
    return left;
  }
  private cmp(): number | boolean {
    const left = this.unary();
    const op = this.peek();
    if (op && op.t === "op" && [">", ">=", "<", "<=", "==", "!="].includes(op.v)) {
      this.next();
      const right = this.unary();
      const a = this.toNum(left), b = this.toNum(right);
      switch (op.v) {
        case ">": return a > b;
        case ">=": return a >= b;
        case "<": return a < b;
        case "<=": return a <= b;
        case "==": return left === right || a === b;
        case "!=": return !(left === right || a === b);
      }
    }
    return left;
  }
  private unary(): number | boolean {
    if (this.peek()?.v === "!") { this.next(); return !this.toBool(this.unary()); }
    return this.primary();
  }
  private primary(): number | boolean {
    const t = this.next();
    if (!t) throw new Error("gate predicate: unexpected end");
    if (t.t === "num") return parseFloat(t.v);
    if (t.t === "bool") return t.v === "true";
    if (t.t === "id") {
      const v = this.bag[t.v];
      if (v === undefined) return false; // unknown metric => not yet satisfied
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v;
      return false; // strings are not comparable in predicates
    }
    if (t.t === "lp") { const v = this.or(); if (this.next()?.t !== "rp") throw new Error("gate predicate: expected )"); return v; }
    throw new Error(`gate predicate: unexpected token '${t.v}'`);
  }

  private toBool(v: number | boolean): boolean { return typeof v === "boolean" ? v : v !== 0; }
  private toNum(v: number | boolean): number { return typeof v === "number" ? v : v ? 1 : 0; }
}

/** Evaluate a gate predicate against the metrics bag. Returns false on any error
 *  (a malformed predicate must never accidentally "open" a gate). */
export function evalGate(predicate: string, bag: MetricsBag): boolean {
  try {
    if (!predicate || !predicate.trim()) return false;
    return new Parser(tokenize(predicate), bag).parse();
  } catch {
    return false;
  }
}

/** Strict variant for testing — throws on malformed predicates. */
export function evalGateStrict(predicate: string, bag: MetricsBag): boolean {
  return new Parser(tokenize(predicate), bag).parse();
}
