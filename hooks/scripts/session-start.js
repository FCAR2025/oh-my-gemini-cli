#!/usr/bin/env node
/*
 * OmG SessionStart hook.
 *
 * Fires on `startup`, `resume`, and `clear`. Injects the `using-omg` skill
 * directive into the conversation so the model knows to invoke skills from the
 * OmG skill registry before responding. Parity with the superpowers SessionStart
 * pattern but for the OmG skill surface.
 *
 * Output contract (Gemini CLI hooks reference -> SessionStart):
 *   - hookSpecificOutput.additionalContext is injected as the first turn
 *     in interactive mode, or prepended to the user prompt non-interactively.
 *   - systemMessage shows at session start in the UI.
 *
 * Failure mode: never block, never throw. If anything fails, emit an empty
 * additionalContext so the CLI proceeds normally.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DISABLED_HOOKS_ENV = "OMG_DISABLED_HOOKS";
const DISABLE_SESSION_START_ENV = "OMG_SESSION_START_DISABLE";
const SESSION_START_KEYS = new Set([
  "session-start",
  "session_start",
  "sessionstart",
  "omg-session-start",
  "using-omg",
]);

function isOff(value) {
  return typeof value === "string" && ["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function hookDisabled() {
  if (isOff(process.env[DISABLE_SESSION_START_ENV] || "")) {
    return false;
  }
  if (process.env[DISABLE_SESSION_START_ENV] && !isOff(process.env[DISABLE_SESSION_START_ENV])) {
    return true;
  }
  const disabled = (process.env[DISABLED_HOOKS_ENV] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return disabled.some((key) => SESSION_START_KEYS.has(key));
}

function resolveExtensionRoot() {
  if (process.env.OMG_EXTENSION_PATH) {
    return process.env.OMG_EXTENSION_PATH;
  }
  if (process.env.extensionPath) {
    return process.env.extensionPath;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function buildDirective(root) {
  const usingOmgPath = path.join(root, "skills", "using-omg", "SKILL.md");
  const usingOmgBody = safeReadFile(usingOmgPath);
  if (!usingOmgBody.trim()) {
    return "";
  }
  return [
    "<EXTREMELY_IMPORTANT>",
    "You have OmG (oh-my-gemini-cli) superpowers.",
    "",
    "**Below is the full content of your `oh-my-gemini-cli:using-omg` skill — your introduction to OmG skills, agents, and hooks. For all other skills, use the Gemini CLI skill activation surface (skill names below).**",
    "",
    usingOmgBody.trim(),
    "</EXTREMELY_IMPORTANT>",
  ].join("\n");
}

function readStdinJson() {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
    process.stdin.on("error", () => resolve({}));
  });
}

function emitOutput(additionalContext, systemMessage) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: additionalContext || "",
    },
  };
  if (systemMessage) {
    payload.systemMessage = systemMessage;
  }
  process.stdout.write(JSON.stringify(payload));
}

async function main() {
  if (hookDisabled()) {
    emitOutput("", "");
    return;
  }
  const root = resolveExtensionRoot();
  const input = await readStdinJson();
  const source = typeof input?.source === "string" ? input.source : "startup";
  const directive = buildDirective(root);
  const banner = directive ? `OmG ready (source=${source})` : "";
  emitOutput(directive, banner);
}

main().catch(() => {
  emitOutput("", "");
});
