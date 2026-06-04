#!/usr/bin/env node

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

async function main() {
  const target = process.argv[2];
  if (typeof target !== "string" || !target.trim()) {
    emitHookOutput("");
    return;
  }

  const resolvedTarget = process.env.OMG_EXTENSION_PATH ? path.join(process.env.OMG_EXTENSION_PATH, target.replace(process.cwd() + "/", "")) : path.resolve(process.cwd(), target);
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
