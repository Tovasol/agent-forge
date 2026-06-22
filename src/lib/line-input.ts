// src/lib/line-input.ts
// A small raw-mode line editor so we can do Claude-Code-style input: ENTER submits,
// MODIFIER+ENTER inserts a newline. Node's readline only ever yields completed
// lines and cannot distinguish Enter from Option-Enter, so we read keypresses
// directly and interpret the terminal's escape sequences ourselves.
//
// Reliable across terminals:
//   - Enter (\r)                          → SUBMIT
//   - Option/Alt+Enter (\x1b\r or \x1b\n) → NEWLINE   (most reliable modifier)
//   - Esc then Enter (\x1b then \r)       → NEWLINE   (fallback chord)
// Best-effort (terminal-dependent):
//   - Ctrl+Enter / Cmd+Enter often send a bare \r or \n that is INDISTINGUISHABLE
//     from Enter, so they cannot be relied on. We document Option+Enter as the
//     primary newline chord and also accept a trailing backslash "\" + Enter and
//     the typed token "/send" / lone "." as universal fallbacks.
//
// Supports: backspace, Ctrl-C (abort), Ctrl-D (EOF/submit-or-close), basic line
// editing within the current buffer. Not a full editor — no cursor movement across
// lines — but enough for comfortable multi-paragraph entry.

import { stdin, stdout } from "node:process";

export interface PromptResult {
  text: string | null; // null = EOF/closed (Ctrl-D on empty) or aborted
  aborted?: boolean; // Ctrl-C
}

const ESC = "\x1b";

/**
 * Read a possibly-multiline block. ENTER submits; Alt/Option+ENTER (or Esc+Enter,
 * or a trailing "\" before Enter) inserts a newline. Returns the assembled text.
 */
export function readMultiline(promptStr: string, continuation = "  ┊ "): Promise<PromptResult> {
  return new Promise((resolve) => {
    const isTTY = stdin.isTTY;
    // Non-TTY (piped input): fall back to a single line via data events.
    if (!isTTY) {
      let buf = "";
      const onData = (d: Buffer) => {
        buf += d.toString("utf8");
        const nl = buf.indexOf("\n");
        if (nl !== -1) {
          stdin.off("data", onData);
          resolve({ text: buf.slice(0, nl).replace(/\r$/, "") });
        }
      };
      const onEnd = () => { stdin.off("data", onData); resolve({ text: buf.length ? buf : null }); };
      stdin.on("data", onData);
      stdin.once("end", onEnd);
      return;
    }

    stdout.write(promptStr);
    const lines: string[] = [];
    let cur = "";

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    };

    const submit = () => {
      cleanup();
      stdout.write("\n");
      lines.push(cur);
      resolve({ text: lines.join("\n") });
    };
    const newline = () => {
      lines.push(cur);
      cur = "";
      stdout.write("\n" + continuation);
    };

    const onData = (chunk: string) => {
      // A chunk may contain a multi-byte escape sequence; handle known ones first.
      // Alt/Option+Enter: ESC followed by CR or LF.
      if (chunk === ESC + "\r" || chunk === ESC + "\n") { newline(); return; }
      // Bare ESC (some terminals send Esc, then the Enter arrives as a separate chunk).
      if (chunk === ESC) { pendingEsc = true; return; }
      if (pendingEsc) {
        pendingEsc = false;
        if (chunk === "\r" || chunk === "\n") { newline(); return; }
        // not an Esc+Enter chord — fall through and treat chunk normally
      }

      for (const ch of chunk) {
        if (ch === "\x03") { // Ctrl-C
          cleanup();
          stdout.write("^C\n");
          resolve({ text: null, aborted: true });
          return;
        }
        if (ch === "\x04") { // Ctrl-D
          cleanup();
          stdout.write("\n");
          const text = (lines.join("\n") + (lines.length ? "\n" : "") + cur).trim();
          resolve({ text: text.length ? text : null });
          return;
        }
        if (ch === "\r" || ch === "\n") {
          // Trailing backslash = explicit newline continuation (universal fallback).
          if (cur.endsWith("\\")) { cur = cur.slice(0, -1); newline(); continue; }
          submit();
          return;
        }
        if (ch === "\x7f" || ch === "\b") { // backspace
          if (cur.length) { cur = cur.slice(0, -1); stdout.write("\b \b"); }
          continue;
        }
        if (ch === "\t") { cur += "  "; stdout.write("  "); continue; }
        // Ignore other control chars; echo printable input.
        if (ch >= " ") { cur += ch; stdout.write(ch); }
      }
    };

    let pendingEsc = false;
    stdin.on("data", onData);
  });
}
