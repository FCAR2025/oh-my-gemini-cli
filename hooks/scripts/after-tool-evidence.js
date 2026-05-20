#!/usr/bin/env node
/*
 * OmG AfterTool evidence capture.
 *
 * Append a one-line JSON record per tool call into
 *   .omg/state/sessions/<session_id>/tool-evidence.jsonl
 *
 * Record fields: ts, tool_name, target (file_path/command summary), error,
 * llmContent_chars (size of agent-facing payload).
 *
 * Stateless w.r.t the model: emits empty JSON so the agent loop sees nothing.
 *
 * Failure mode: silent. Never throw, never block.
 *
 * Disable: OMG_DISABLED_HOOKS=evidence-capture or OMG_AFTER_TOOL_DISABLE=1.
 */

import fs from "node:fs";
import path from "node:path";

const DISABLED_HOOKS_ENV = "OMG_DISABLED_HOOKS";
const DISABLE_ENV = "OMG_AFTER_TOOL_DISABLE";
const HOOK_KEYS = new Set([
  "evidence-capture",
  "after-tool",
  "after_tool",
  "aftertool",
  "omg-evidence-capture",
]);

function isOff(v) {
  return typeof v === "string" && ["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}

function hookDisabled() {
  if (process.env[DISABLE_ENV] && !isOff(process.env[DISABLE_ENV])) {
    return true;
  }
  const list = (process.env[DISABLED_HOOKS_ENV] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.some((k) => HOOK_KEYS.has(k));
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

function emit(payload) {
  process.stdout.write(JSON.stringify(payload || {}));
}

function summarizeTarget(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== "object") return "";
  if (toolName === "run_shell_command") {
    return String(toolInput.command || "").slice(0, 200);
  }
  return String(toolInput.file_path || toolInput.absolute_path || toolInput.path || "").slice(0, 200);
}

function summarizeError(toolResponse) {
  if (!toolResponse || typeof toolResponse !== "object") return "";
  if (toolResponse.error) return String(toolResponse.error).slice(0, 200);
  return "";
}

function llmContentChars(toolResponse) {
  if (!toolResponse || typeof toolResponse !== "object") return 0;
  const content = toolResponse.llmContent;
  if (typeof content === "string") return content.length;
  try {
    return JSON.stringify(content || "").length;
  } catch {
    return 0;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* best-effort */
  }
}

async function main() {
  if (hookDisabled()) {
    emit({});
    return;
  }
  const input = await readStdinJson();
  const sessionId = input?.session_id || "unknown";
  const cwd = input?.cwd || process.cwd();
  const dir = path.join(cwd, ".omg", "state", "sessions", String(sessionId));
  ensureDir(dir);
  const record = {
    ts: new Date().toISOString(),
    tool_name: input?.tool_name || "",
    target: summarizeTarget(input?.tool_name, input?.tool_input),
    error: summarizeError(input?.tool_response),
    llm_content_chars: llmContentChars(input?.tool_response),
  };
  try {
    fs.appendFileSync(path.join(dir, "tool-evidence.jsonl"), JSON.stringify(record) + "\n");
  } catch {
    /* best-effort */
  }
  emit({});
}

main().catch(() => {
  emit({});
});
