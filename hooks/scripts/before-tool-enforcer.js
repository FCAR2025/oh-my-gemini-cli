#!/usr/bin/env node
/*
 * OmG BeforeTool delegation + safety enforcer.
 *
 * Fires before run_shell_command, write_file, and replace. Adds advisory
 * `systemMessage` warnings for risky patterns and (optionally) blocks the most
 * destructive shell commands. Never blocks file edits; never overrides args.
 *
 * Output contract per Gemini hooks reference:
 *   - decision: "deny" + reason -> agent sees tool error; turn continues.
 *   - systemMessage -> shown immediately to operator.
 *
 * Disable: OMG_DISABLED_HOOKS=delegation-enforcer or OMG_BEFORE_TOOL_DISABLE=1.
 * Soften: OMG_ENFORCER_SOFT=1 -> warnings only, no deny.
 */

const DISABLED_HOOKS_ENV = "OMG_DISABLED_HOOKS";
const DISABLE_ENV = "OMG_BEFORE_TOOL_DISABLE";
const SOFT_ENV = "OMG_ENFORCER_SOFT";
const HOOK_KEYS = new Set([
  "delegation-enforcer",
  "before-tool",
  "before_tool",
  "beforetool",
  "omg-delegation-enforcer",
]);

// Patterns that warrant a hard deny on run_shell_command.
const HARD_DENY = [
  { rx: /\brm\s+-rf\s+\/(?:\s|$|[^a-zA-Z])/i, reason: "rm -rf on root path. Refusing — confirm exact target with operator." },
  { rx: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i, reason: "Fork bomb pattern detected. Refusing." },
  { rx: /\bmkfs\.[a-z]+\b/i, reason: "Filesystem format command. Refusing — require explicit operator authorization." },
  { rx: /\bdd\s+if=\/dev\/(zero|urandom|random)\s+of=\/dev\/[sh]d[a-z]/i, reason: "dd to raw block device. Refusing — require explicit operator authorization." },
];

// Patterns that warrant a warning but not a deny.
const WARN = [
  { rx: /\bgit\s+push\s+(--force|-f)\b/i, hint: "force-push detected: confirm branch is not main/master + remote scope is intentional." },
  { rx: /\bgit\s+reset\s+--hard\b/i, hint: "git reset --hard: ensure changes are committed/stashed first." },
  { rx: /\bgit\s+clean\s+-[a-z]*f/i, hint: "git clean -f: deletes untracked files. Confirm scope." },
  { rx: /\bnpm\s+publish\b/i, hint: "npm publish: confirm version + registry + auth." },
  { rx: /\bcargo\s+publish\b/i, hint: "cargo publish: confirm version + crates.io auth." },
  { rx: /\bdocker\s+system\s+prune/i, hint: "docker system prune: confirm scope (containers, images, volumes)." },
  { rx: /\bkubectl\s+delete\b/i, hint: "kubectl delete: confirm namespace + resource scope." },
  { rx: /\b(--no-verify|--no-gpg-sign)\b/i, hint: "skipping git hooks/signing. Confirm operator authorized this bypass." },
];

function isOff(v) {
  return typeof v === "string" && ["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}

function isOn(v) {
  return typeof v === "string" && !isOff(v) && v.trim() !== "";
}

function hookDisabled() {
  if (process.env[DISABLE_ENV] && !isOff(process.env[DISABLE_ENV])) {
    return true;
  }
  const list = (process.env[DISABLED_HOOKS_ENV] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.some((k) => HOOK_KEYS.has(k));
}

function softMode() {
  return isOn(process.env[SOFT_ENV] || "");
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
  process.stdout.write(JSON.stringify(payload));
}

function inspectShell(command) {
  if (typeof command !== "string") {
    return { deny: null, warnings: [] };
  }
  for (const rule of HARD_DENY) {
    if (rule.rx.test(command)) {
      return { deny: rule.reason, warnings: [] };
    }
  }
  const warnings = WARN.filter((r) => r.rx.test(command)).map((r) => r.hint);
  return { deny: null, warnings };
}

async function main() {
  if (hookDisabled()) {
    emit({});
    return;
  }
  const input = await readStdinJson();
  const toolName = input?.tool_name || "";
  const toolInput = input?.tool_input || {};

  if (toolName === "run_shell_command") {
    const command = toolInput.command || "";
    const { deny, warnings } = inspectShell(command);
    if (deny && !softMode()) {
      emit({
        decision: "deny",
        reason: `OmG enforcer: ${deny}`,
      });
      return;
    }
    const messages = [];
    if (deny && softMode()) {
      messages.push(`[OmG enforcer SOFT] would-deny: ${deny}`);
    }
    if (warnings.length > 0) {
      messages.push(`[OmG enforcer] ${warnings.join(" | ")}`);
    }
    if (messages.length === 0) {
      emit({});
      return;
    }
    emit({ systemMessage: messages.join("\n") });
    return;
  }

  // write_file / replace: no deny, optional advisory if writing to .env-like paths.
  if (toolName === "write_file" || toolName === "replace") {
    const target = toolInput.file_path || toolInput.absolute_path || "";
    if (/(^|\/)\.env(\.|$)/.test(target) || /credentials\.json$/i.test(target)) {
      emit({ systemMessage: `[OmG enforcer] writing to potential secret file: ${target}. Confirm content has no real credentials.` });
      return;
    }
    emit({});
    return;
  }

  emit({});
}

main().catch(() => {
  emit({});
});
