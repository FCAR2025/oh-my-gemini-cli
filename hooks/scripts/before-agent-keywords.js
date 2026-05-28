#!/usr/bin/env node
/*
 * OmG BeforeAgent keyword detector.
 *
 * Parity with OMC's UserPromptSubmit keyword detector. Scans the incoming
 * user prompt for OmG/Gemini-relevant trigger words and injects a short
 * routing hint via hookSpecificOutput.additionalContext so the model knows
 * which OmG skill, slash command, or agent to reach for.
 *
 * Fails open: any error -> empty additionalContext, never block.
 *
 * Disable: set OMG_DISABLED_HOOKS=keyword-detector or OMG_BEFORE_AGENT_DISABLE=1.
 */

const DISABLED_HOOKS_ENV = "OMG_DISABLED_HOOKS";
const DISABLE_ENV = "OMG_BEFORE_AGENT_DISABLE";
const HOOK_KEYS = new Set([
  "keyword-detector",
  "before-agent",
  "before_agent",
  "beforeagent",
  "omg-keyword-detector",
]);

// Each rule: regex on lowercased prompt -> hint line for the model.
const RULES = [
  { rx: /\b(autopilot|fully autonomous|self-driving)\b/i, hint: "Trigger detected: **autopilot**. Recommend `/omg:autopilot --intent=\"<core objective>\"` (full autonomous: plan -> prd -> exec -> verify -> fix loop)." },
  { rx: /\b(ralph|ralph loop|self-referential loop)\b/i, hint: "Trigger detected: **ralph**. Recommend `/omg:loop` or `/omg:goal --intent=\"<core objective>\"` for ralph-style autonomous-delivery loop." },
  { rx: /\b(ultrawork|ulw|parallel execution)\b/i, hint: "Trigger detected: **ultrawork**. Activate `subagent-driven-development` or `dispatching-parallel-agents` skill before spawning sub-agents." },
  { rx: /\b(ccg|claude\+codex\+gemini|tri[- ]?model|council)\b/i, hint: "Trigger detected: **ccg / council**. Use `ccg` skill (multi-model orchestration) or `/omg:consensus`." },
  { rx: /\b(ralplan|ralph plan)\b/i, hint: "Trigger detected: **ralplan**. Use `ralplan` skill (consensus gate before ralph/autopilot)." },
  { rx: /\b(deep[- ]?interview|socratic)\b/i, hint: "Trigger detected: **deep-interview**. Use `deep-interview` skill (Socratic gating before execution approval)." },
  { rx: /\b(deslop|anti[- ]?slop|ai slop)\b/i, hint: "Trigger detected: **ai-slop-cleaner**. Use `ai-slop-cleaner` skill (regression-safe deletion-first cleanup)." },
  { rx: /\b(tdd|test[- ]?driven)\b/i, hint: "Trigger detected: **tdd**. Use `test-driven-development` skill BEFORE writing implementation code." },
  { rx: /\b(brainstorm|explore options|design discussion)\b/i, hint: "Trigger detected: **brainstorming**. Use `brainstorming` skill BEFORE any creative/design work." },
  { rx: /\b(why is .* (failing|broken)|debug this|root cause|stack trace)\b/i, hint: "Trigger detected: **debugging**. Use `systematic-debugging` skill BEFORE proposing fixes." },
  { rx: /\b(verify (this|the))|did .* actually (work|pass|complete)\b/i, hint: "Trigger detected: **verification**. Use `verification-before-completion` or `/omg:ultraqa` (adversarial verify -> diagnose -> fix)." },
  { rx: /\b(plan (this|the)|write a plan|implementation plan)\b/i, hint: "Trigger detected: **planning**. Use `writing-plans` skill (spec-grade implementation plan) BEFORE touching code." },
  { rx: /\b(subagent[- ]?driven|delegate to subagents?|fan out to agents)\b/i, hint: "Trigger detected: **subagent-driven-development**. Use that skill before spawning parallel sub-agents." },
  { rx: /\b(mcp server|mcp config|model context protocol)\b/i, hint: "Trigger detected: **mcp-setup**. Use `mcp-setup` skill for MCP server configuration." },
  { rx: /\b(deepinit|deep ?init|deep codebase init)\b/i, hint: "Trigger detected: **deepinit**. Use `deepinit` skill for hierarchical AGENTS.md documentation." },
  { rx: /\b(visual verdict|screenshot compare|visual qa)\b/i, hint: "Trigger detected: **visual-verdict**. Use `visual-verdict` skill for structured visual QA." },
  { rx: /\b(release|ship to prod|prepare release)\b/i, hint: "Trigger detected: **release**. Use `release` skill or `/omg:release` for release workflow." },
  { rx: /\b(merge|commit|push|pr|pull request)\b/i, hint: "Trigger detected: **git workflow**. Consider `finishing-a-development-branch` skill before merge/PR." },
  { rx: /\b(cancel ?omc|cancel ?omg|stop the loop)\b/i, hint: "Trigger detected: **cancel**. Use `/omg:cancel` to end active autopilot/ralph/ultrawork/team mode." },
  { rx: /\b(web[- ]?hook|web[- ]?hooks)\b/i, hint: "Trigger detected: **webhook**. Consider `vibe-code-prod-core` (money-critical signature validation) or `/omg:ultraqa` (security review)." },
];

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

function detectHints(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    return [];
  }
  // Strip code blocks, inline code, quoted values, and markdown blockquotes to prevent false-positives when discussing trigger keywords
  const cleanPrompt = prompt
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/["'][^"']+["']/g, "")
    .replace(/^\s*>.*$/gm, "");

  const matched = [];
  for (const rule of RULES) {
    if (rule.rx.test(cleanPrompt)) {
      matched.push(rule.hint);
    }
  }
  return matched;
}

function emitOutput(additionalContext) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: "BeforeAgent",
      additionalContext: additionalContext || "",
    },
  };
  process.stdout.write(JSON.stringify(payload));
}

async function main() {
  if (hookDisabled()) {
    emitOutput("");
    return;
  }
  const input = await readStdinJson();
  const hints = detectHints(input?.prompt);
  if (hints.length === 0) {
    emitOutput("");
    return;
  }
  const block = [
    "<omg-routing-hints>",
    "OmG keyword-detector matched the following triggers. Honor them before responding:",
    ...hints.map((h) => `- ${h}`),
    "</omg-routing-hints>",
  ].join("\n");
  emitOutput(block);
}

main().catch(() => {
  emitOutput("");
});
