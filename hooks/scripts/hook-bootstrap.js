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

main().catch(() => {
  // Fail open so a broken optional hook never blocks the parent CLI flow.
  emitHookOutput("");
});
