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

function buildOutput(model) {
  if (!model) {
    return {
      decision: "allow",
      systemMessage: "",
      suppressOutput: true,
    };
  }
  return {
    decision: "allow",
    systemMessage: "",
    suppressOutput: true,
    hookSpecificOutput: {
      llm_request: {
        model,
      },
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

  process.stdout.write(JSON.stringify(buildOutput(model)));
}

main().catch(() => {
  process.stdout.write(JSON.stringify(buildOutput("")));
});
