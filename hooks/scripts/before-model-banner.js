#!/usr/bin/env node
/*
 * OmG silent BeforeModel router.
 *
 * Routes outgoing Gemini CLI model requests according to `.omg/state/model.json`
 * without printing the old per-request banner.
 */

import fs from "node:fs";
import path from "node:path";

const STATE_ROOT_ENV = "OMG_STATE_ROOT";
const DISABLED_HOOKS_ENV = "OMG_DISABLED_HOOKS";
const MODEL_ROUTING_ENV = "OMG_MODEL_ROUTING";
const MODEL_HOOK_KEYS = new Set([
  "model",
  "model-routing",
  "model-router",
  "model-preview",
  "model-banner",
  "omg-model-router",
  "omg-before-model-banner",
]);

const DEFAULT_LANE_MODELS = {
  planning: "gemini-3.1-pro-preview",
  execution: "gemini-3-flash-preview",
  quick_edit: "gemini-3.1-flash-lite-preview",
  review_verify: "gemini-3.1-pro-preview",
};

const LANE_PATTERNS = [
  {
    lane: "quick_edit",
    patterns: [
      /\bomg-quick\b/i,
      /\bquick[_ -]?edit\b/i,
      /\bflash-lite\b/i,
      /\blow-risk (edit|change|fix)\b/i,
    ],
  },
  {
    lane: "execution",
    patterns: [
      /\bomg-executor\b/i,
      /\/omg:team-exec\b/i,
      /\$execute\b/i,
      /\bteam-exec\b/i,
      /\bstage 3\/5\b/i,
      /\bimplement approved\b/i,
      /\bimplementation-heavy\b/i,
    ],
  },
  {
    lane: "review_verify",
    patterns: [
      /\bomg-reviewer\b/i,
      /\bomg-verifier\b/i,
      /\bomg-debugger\b/i,
      /\/omg:team-verify\b/i,
      /\/omg:team-fix\b/i,
      /\bteam-verify\b/i,
      /\bteam-fix\b/i,
      /\breview[_ -]?verify\b/i,
      /\bacceptance gate\b/i,
      /\bverification\b/i,
    ],
  },
  {
    lane: "planning",
    patterns: [
      /\bomg-director\b/i,
      /\bomg-architect\b/i,
      /\bomg-planner\b/i,
      /\bomg-product\b/i,
      /\bomg-consultant\b/i,
      /\bomg-researcher\b/i,
      /\/omg:team-plan\b/i,
      /\/omg:team-prd\b/i,
      /\/omg:team-assemble\b/i,
      /\$plan\b/i,
      /\$omg-plan\b/i,
      /\$prd\b/i,
      /\$research\b/i,
      /\bteam-plan\b/i,
      /\bteam-prd\b/i,
      /\bteam-assemble\b/i,
      /\bplanning\b/i,
      /\bresearch\b/i,
      /\barchitecture\b/i,
    ],
  },
];

function readStdinText() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(typeof text === "string" ? text.replace(/^\uFEFF/, "") : text);
  } catch {
    return fallback;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOff(value) {
  return typeof value === "string" && ["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function parseCsvEnv(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isHookDisabled(disabledHooks, candidates) {
  for (const candidate of candidates) {
    if (disabledHooks.includes(candidate)) {
      return true;
    }
  }
  return false;
}

function resolveSessionCwd(hookInput) {
  const rawCwd =
    typeof hookInput?.cwd === "string" && hookInput.cwd.trim()
      ? hookInput.cwd.trim()
      : "";
  if (!rawCwd) {
    return null;
  }

  const resolved = path.resolve(rawCwd);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveStateRoot(cwd) {
  const customStateRoot = process.env[STATE_ROOT_ENV];
  if (typeof customStateRoot === "string" && customStateRoot.trim()) {
    return path.isAbsolute(customStateRoot)
      ? customStateRoot.trim()
      : cwd
        ? path.join(cwd, customStateRoot.trim())
        : null;
  }
  return cwd ? path.join(cwd, ".omg", "state") : null;
}

function readJsonFile(filePath, fallback = {}) {
  if (!filePath) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = safeJsonParse(raw, fallback);
    return isObject(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeStrategy(strategy) {
  if (typeof strategy !== "string") {
    return "balanced";
  }
  const normalized = strategy.trim().toLowerCase();
  return ["balanced", "auto", "custom"].includes(normalized) ? normalized : "balanced";
}

function readModelPolicy(cwd) {
  const stateRoot = resolveStateRoot(cwd);
  const modelState = readJsonFile(stateRoot ? path.join(stateRoot, "model.json") : "", {});
  const strategy = normalizeStrategy(modelState.strategy);
  const stateLaneModels = isObject(modelState.lane_models) ? modelState.lane_models : {};
  return {
    strategy,
    laneModels: {
      ...DEFAULT_LANE_MODELS,
      ...stateLaneModels,
    },
  };
}

function collectText(value, parts = []) {
  if (typeof value === "string") {
    parts.push(value);
    return parts;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, parts);
    }
    return parts;
  }
  if (isObject(value)) {
    for (const item of Object.values(value)) {
      collectText(item, parts);
    }
  }
  return parts;
}

function detectLane(hookInput) {
  const request = hookInput?.llm_request || {};
  const text = collectText([
    hookInput?.prompt,
    hookInput?.agent,
    hookInput?.agent_name,
    hookInput?.metadata,
    request.messages,
    request.systemInstruction,
    request.system_instruction,
  ]).join("\n");

  for (const { lane, patterns } of LANE_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(text))) {
      return lane;
    }
  }
  // Default to execution lane (Flash) for unclassified requests instead of
  // planning (Pro). Cheap-default policy: never silently route an unrouted
  // request to the most expensive model. Operators who want Pro can route
  // explicitly via /omg:model or /omg:capabilities.
  return "execution";
}

// ---------------------------------------------------------------------------
// Gemini 3.5 Flash awareness (launched I/O 2026 May 19).
//
// Schema differences vs 2.5 Flash that this hook normalizes:
//   - 3.x uses `thinkingConfig.thinkingLevel` (enum: minimal|low|medium|high).
//     2.5 uses `thinkingConfig.thinkingBudget` (integer). Sending the wrong
//     field is silently ignored upstream — translate before request leaves.
//   - 3.5 Flash docs say not to lower temperature below 1.0.
//   - 3.5 Flash is 5x the cost of 2.5 Flash; surface a cost tier marker so
//     the operator sees it before the spend lands on the bill.
//   - 3.5 Flash has no Live API support — Live sessions must NOT route here
//     (gated upstream; this hook just refuses to translate Live payloads).
// ---------------------------------------------------------------------------
const GEMINI_3X_RX = /^gemini-3(\.|-)/i;
const GEMINI_25X_RX = /^gemini-2(\.|-)5/i;
const GEMINI_35_FLASH_RX = /^gemini-3(\.|-)5(\.|-)?flash/i;
const GEMINI_PRO_RX = /^gemini-[0-9.\-]+pro/i;

const THINKING_LEVEL_TO_BUDGET = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
};

function costTier(model) {
  if (typeof model !== "string" || !model) {
    return "";
  }
  if (GEMINI_PRO_RX.test(model)) {
    return "$$$";
  }
  if (GEMINI_35_FLASH_RX.test(model)) {
    return "$$";
  }
  if (GEMINI_25X_RX.test(model)) {
    return "$";
  }
  return "";
}

function isObjectLike(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureThinkingConfig(generationConfig) {
  if (!isObjectLike(generationConfig.thinkingConfig)) {
    generationConfig.thinkingConfig = {};
  }
  return generationConfig.thinkingConfig;
}

function transformGenerationConfig(model, generationConfig) {
  // Returns { generationConfig, warnings: string[] }
  const warnings = [];
  if (!isObjectLike(generationConfig)) {
    return { generationConfig, warnings };
  }
  // Defensive copy — never mutate inputs we did not own.
  const next = { ...generationConfig };
  if (isObjectLike(next.thinkingConfig)) {
    next.thinkingConfig = { ...next.thinkingConfig };
  }

  if (GEMINI_3X_RX.test(model)) {
    // 3.x branch: thinkingLevel is canonical.
    const tc = ensureThinkingConfig(next);
    if (Object.prototype.hasOwnProperty.call(tc, "thinkingBudget")) {
      const droppedBudget = tc.thinkingBudget;
      delete tc.thinkingBudget;
      if (!tc.thinkingLevel) {
        tc.thinkingLevel = "medium";
      }
      warnings.push(
        `Gemini 3.x detected (${model}); dropped legacy thinkingConfig.thinkingBudget=${droppedBudget} and set thinkingLevel=${tc.thinkingLevel}.`,
      );
    }
    if (GEMINI_35_FLASH_RX.test(model)) {
      // 3.5 Flash docs: do not lower temperature below 1.0.
      if (typeof next.temperature === "number" && next.temperature < 1.0) {
        warnings.push(
          `Gemini 3.5 Flash detected; raising temperature ${next.temperature} -> 1.0 (docs: do not lower below 1.0).`,
        );
        next.temperature = 1.0;
      } else if (typeof next.temperature !== "number") {
        next.temperature = 1.0;
      }
    }
  } else if (GEMINI_25X_RX.test(model)) {
    // 2.5 branch: thinkingBudget is canonical.
    const tc = next.thinkingConfig;
    if (isObjectLike(tc) && Object.prototype.hasOwnProperty.call(tc, "thinkingLevel")) {
      const level = String(tc.thinkingLevel).toLowerCase();
      const translated = THINKING_LEVEL_TO_BUDGET[level] ?? THINKING_LEVEL_TO_BUDGET.medium;
      delete tc.thinkingLevel;
      tc.thinkingBudget = translated;
      warnings.push(
        `Gemini 2.5.x detected (${model}); translated thinkingConfig.thinkingLevel=${level} -> thinkingBudget=${translated}.`,
      );
    }
  }

  return { generationConfig: next, warnings };
}

function buildOutput(model, options = {}) {
  const { generationConfig, systemMessage } = options;
  if (!model) {
    return {
      decision: "allow",
      systemMessage: systemMessage || "",
      suppressOutput: !systemMessage,
    };
  }
  const llmRequest = { model };
  if (generationConfig) {
    llmRequest.generationConfig = generationConfig;
  }
  return {
    decision: "allow",
    systemMessage: systemMessage || "",
    suppressOutput: !systemMessage,
    hookSpecificOutput: {
      llm_request: llmRequest,
    },
  };
}

async function main() {
  const rawInput = await readStdinText();
  const hookInput = safeJsonParse(rawInput, {});
  const disabledHooks = parseCsvEnv(process.env[DISABLED_HOOKS_ENV]);
  if (
    isOff(process.env[MODEL_ROUTING_ENV]) ||
    isHookDisabled(disabledHooks, [...MODEL_HOOK_KEYS])
  ) {
    process.stdout.write(JSON.stringify(buildOutput("")));
    return;
  }

  const cwd = resolveSessionCwd(hookInput);
  const policy = readModelPolicy(cwd);
  const lane = detectLane(hookInput);
  const model = policy.strategy === "auto" ? "auto" : policy.laneModels[lane] || DEFAULT_LANE_MODELS[lane];

  // Apply 3.x/2.5 schema translation when the incoming request carries a
  // generationConfig with the wrong-shape thinking config for the routed model.
  const incomingGenerationConfig = hookInput?.llm_request?.generationConfig;
  let outgoingGenerationConfig;
  const warnings = [];
  if (model && model !== "auto" && isObjectLike(incomingGenerationConfig)) {
    const result = transformGenerationConfig(model, incomingGenerationConfig);
    if (result.warnings.length > 0) {
      outgoingGenerationConfig = result.generationConfig;
      warnings.push(...result.warnings);
    }
  } else if (model && model !== "auto" && GEMINI_35_FLASH_RX.test(model)) {
    // No incoming generationConfig but routed model is 3.5 Flash — set the
    // temperature floor + default thinkingLevel so the proxy gets a coherent
    // request shape.
    outgoingGenerationConfig = {
      temperature: 1.0,
      thinkingConfig: { thinkingLevel: "medium" },
    };
  }

  const tier = costTier(model);
  const banner = tier
    ? `OmG model route: ${model} ${tier}${warnings.length ? ` | ${warnings.join(" ")}` : ""}`
    : warnings.length
      ? `OmG model route: ${model} | ${warnings.join(" ")}`
      : "";

  process.stdout.write(
    JSON.stringify(
      buildOutput(model, {
        generationConfig: outgoingGenerationConfig,
        systemMessage: banner,
      }),
    ),
  );
}

main().catch(() => {
  process.stdout.write(JSON.stringify(buildOutput("")));
});
