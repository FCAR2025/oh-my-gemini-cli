#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function emitHookOutput(systemMessage = "") {
  process.stdout.write(
    JSON.stringify({
      decision: "allow",
      systemMessage,
    }),
  );
}

function resolveTargetPath(target) {
  const trimmed = target.trim();
  const extRoot =
    typeof process.env.OMG_EXTENSION_PATH === "string" ? process.env.OMG_EXTENSION_PATH.trim() : "";
  if (!extRoot) {
    return path.resolve(process.cwd(), trimmed);
  }
  if (!path.isAbsolute(trimmed)) {
    return path.resolve(extRoot, trimmed);
  }
  const cwdWithSep = process.cwd().endsWith(path.sep) ? process.cwd() : `${process.cwd()}${path.sep}`;
  if (trimmed.startsWith(cwdWithSep)) {
    const relocated = path.resolve(extRoot, trimmed.slice(cwdWithSep.length));
    try {
      if (fs.existsSync(relocated)) {
        return relocated;
      }
    } catch {}
  }
  return path.resolve(trimmed);
}

async function main() {
  const target = process.argv[2];
  if (typeof target !== "string" || !target.trim()) {
    emitHookOutput("");
    return;
  }

  const resolvedTarget = resolveTargetPath(target);
  await import(pathToFileURL(resolvedTarget).href);
}

// Watchdog: a hook must NEVER block the gemini-cli. The per-turn hook scripts read
// process.stdin to EOF (readStdinText); when the CLI doesn't promptly close the hook's
// stdin, that read hangs and the CLI's configured 3-5s hook timeout is NOT enforced,
// producing 40s-2min "Executing Hooks"/"Thinking" stalls on every turn that compound to
// an apparent hang over a multi-step agentic run. Bound every hook here at the single
// shared entry point: force a fail-open exit after OMG_HOOK_WATCHDOG_MS (default 2000),
// emitting the allow decision only if the target hasn't already written output (so a
// healthy fast hook is never double-written). unref() so a healthy hook still exits
// naturally without waiting out the timer.
let __omgWrote = false;
const __omgRealWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  __omgWrote = true;
  return __omgRealWrite(chunk, ...rest);
};
const __omgWatchdog = setTimeout(() => {
  if (!__omgWrote) emitHookOutput("");
  process.exit(0);
}, Number(process.env.OMG_HOOK_WATCHDOG_MS) || 2000);
__omgWatchdog.unref?.();

main().catch(() => {
  // Fail open so a broken optional hook never blocks the parent CLI flow.
  if (!__omgWrote) emitHookOutput("");
});
