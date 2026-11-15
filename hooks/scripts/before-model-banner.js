#!/usr/bin/env node
/*
 * OmA silent BeforeModel router.
 *
 * Routes outgoing Gemini CLI model requests according to `.omg/state/model.json`
 * (`strategy`, `default_fast_lane`, `lane_models`, and `role_models`)
 * without printing the old per-request banner.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STATE_ROOT_ENV = "OMG_STATE_ROOT";
const DISABLED_HOOKS_ENV = "OMG_DISABLED_HOOKS";
const MODEL_ROUTING_ENV = "OMG_MODEL_ROUTING";
const MODEL_ROUTING_TRACE_ENV = "OMG_MODEL_ROUTING_TRACE";
const MODEL_HOOK_KEYS = new Set([
  "model",
  "model-routing",
  "model-router",
  "model-preview",
  "model-banner",
  "oma-model-router",
  "oma-before-model-banner",
]);

const DEFAULT_LANE_MODELS = {
  architecture_security: "gemini-4-carbon-high",
  planning: "gemini-4-carbon-medium",
  execution: "gemini-4-argon-high",
  fast_execution: "gemini-4-hydrogen-high",
  quick_edit: "gemini-4-hydrogen-low",
  review_verify: "gemini-4-argon-high",
  deep_fast_review: "gemini-4-hydrogen-xhigh",
  verification: "gemini-4-argon-medium",
  tool_calling: "gemini-4-argon-high",
  multimodal_review: "gemini-4-carbon-high",
  external_research: "gemini-4-hydrogen-high",
  editorial: "gemini-4-hydrogen-medium",
};

const ROLE_STEM_ROUTES = Object.assign(Object.create(null), {
  architect: { canonicalRole: "oma-architect", lane: "architecture_security" },
  critic: { canonicalRole: "omg-critic", lane: "architecture_security" },
  "security-reviewer": { canonicalRole: "omg-security-reviewer", lane: "architecture_security" },
  consensus: { canonicalRole: "oma-consensus", lane: "architecture_security" },
  director: { canonicalRole: "oma-director", lane: "architecture_security" },
  planner: { canonicalRole: "oma-planner", lane: "planning" },
  product: { canonicalRole: "oma-product", lane: "planning" },
  consultant: { canonicalRole: "oma-consultant", lane: "planning" },
  interview: { canonicalRole: "oma-interview", lane: "planning" },
  executor: { canonicalRole: "oma-executor", lane: "execution" },
  debugger: { canonicalRole: "oma-debugger", lane: "execution" },
  "test-engineer": { canonicalRole: "omg-test-engineer", lane: "execution" },
  reviewer: { canonicalRole: "oma-reviewer", lane: "review_verify" },
  "dependency-expert": { canonicalRole: "omg-dependency-expert", lane: "execution" },
  verifier: { canonicalRole: "oma-verifier", lane: "verification" },
  researcher: { canonicalRole: "oma-researcher", lane: "external_research" },
  editor: { canonicalRole: "oma-editor", lane: "editorial" },
  quick: { canonicalRole: "oma-quick", lane: "quick_edit" },
});

const PROMPT_ROLE_TOKEN_RX = /\b(?:oma|omg)-([a-z0-9-]+)\b/gi;
const CANONICAL_GEMINI4_RX = /^gemini-4-(?:carbon|argon|hydrogen)-(?:low|medium|high|xhigh)$/i;

const LANE_PATTERNS = [
  {
    lane: "deep_fast_review",
    label: "deep-fast-review",
    patterns: [
      /\bdeep[_ -]fast[_ -]review\b/i,
    ],
  },
  {
    lane: "multimodal_review",
    label: "multimodal-review",
    patterns: [
      /\/om[ag]:visual-verdict\b/i,
      /\$visual-verdict\b/i,
      /\bmultimodal[_ -]review\b/i,
      /\bvisual[_ -]verdict\b/i,
    ],
  },
  {
    lane: "architecture_security",
    label: "architecture-security",
    patterns: [
      /\/om[ag]:consensus\b/i,
      /\/om[ag]:ccg\b/i,
      /\$consensus\b/i,
      /\$ccg\b/i,
      /\barchitecture[_ -]security\b/i,
      /\bsecurity audit\b/i,
    ],
  },
  {
    lane: "quick_edit",
    label: "quick-edit",
    patterns: [
      /\bquick[_ -]?edit\b/i,
      /\bflash-lite\b/i,
      /\blow-risk (edit|change|fix)\b/i,
    ],
  },
  {
    lane: "editorial",
    label: "editorial",
    patterns: [
      /\beditorial\b/i,
    ],
  },
  {
    lane: "verification",
    label: "verification",
    patterns: [
      /\/om[ag]:verify\b/i,
      /\/om[ag]:team-verify\b/i,
      /\$verify\b/i,
      /\bteam-verify\b/i,
      /\bacceptance gate\b/i,
      /\bverification\b/i,
    ],
  },
  {
    lane: "review_verify",
    label: "review-verify",
    patterns: [
      /\/om[ag]:ultraqa\b/i,
      /\/om[ag]:team-fix\b/i,
      /\$ultraqa\b/i,
      /\bteam-fix\b/i,
      /\breview[_ -]?verify\b/i,
    ],
  },
  {
    lane: "external_research",
    label: "external-research",
    patterns: [
      /\/om[ag]:research\b/i,
      /\/om[ag]:external-context\b/i,
      /\$research\b/i,
      /\$external-context\b/i,
      /\bexternal[_ -]research\b/i,
    ],
  },
  {
    lane: "fast_execution",
    label: "fast-execution",
    patterns: [
      /\bfast[_ -]execution\b/i,
    ],
  },
  {
    lane: "tool_calling",
    label: "tool-calling",
    patterns: [
      /\btool[_ -]calling\b/i,
    ],
  },
  {
    lane: "execution",
    label: "execution",
    patterns: [
      /\/om[ag]:execute\b/i,
      /\/om[ag]:team-exec\b/i,
      /\$execute\b/i,
      /\bteam-exec\b/i,
      /\bstage 3\/5\b/i,
      /\bimplement approved\b/i,
      /\bimplementation-heavy\b/i,
    ],
  },
  {
    lane: "planning",
    label: "planning",
    patterns: [
      /\/om[ag]:(?:oma-)?plan\b/i,
      /\/om[ag]:ralplan\b/i,
      /\/om[ag]:prd\b/i,
      /\/om[ag]:blueprint\b/i,
      /\/om[ag]:(?:deep-)?interview\b/i,
      /\/om[ag]:team-plan\b/i,
      /\/om[ag]:team-prd\b/i,
      /\/om[ag]:team-assemble\b/i,
      /\$plan\b/i,
      /\$om[ag]-plan\b/i,
      /\$prd\b/i,
      /\bteam-plan\b/i,
      /\bteam-prd\b/i,
      /\bteam-assemble\b/i,
      /\bplanning\b/i,
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

function isOn(value) {
  return typeof value === "string" && ["1", "true", "yes", "on", "trace"].includes(value.trim().toLowerCase());
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

function resolveSessionCwd(envelopeCwd) {
  const rawCwd =
    typeof envelopeCwd === "string" && envelopeCwd.trim()
      ? envelopeCwd.trim()
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

  // 1. Check cwd-local state root (.omg/state/model.json exists)
  const localStateRoot = cwd ? path.join(cwd, ".omg", "state") : null;
  if (localStateRoot) {
    const localModelJson = path.join(localStateRoot, "model.json");
    try {
      if (fs.existsSync(localModelJson)) {
        return localStateRoot;
      }
    } catch {}
  }

  // 2. Check $HOME global state root (~/.omg/state/model.json exists)
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  if (homeDir) {
    const globalStateRoot = path.join(homeDir, ".omg", "state");
    const globalModelJson = path.join(globalStateRoot, "model.json");
    try {
      if (fs.existsSync(globalModelJson)) {
        return globalStateRoot;
      }
    } catch {}
  }

  return localStateRoot;
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

function normalizeModelMap(rawMap) {
  const normalized = Object.create(null);
  if (!isObject(rawMap)) {
    return normalized;
  }
  for (const [key, value] of Object.entries(rawMap)) {
    if (typeof key === "string" && typeof value === "string") {
      const k = key.trim().toLowerCase();
      const v = value.trim();
      if (k && v) {
        normalized[k] = v;
      }
    }
  }
  return normalized;
}

function readModelPolicy(cwd) {
  const stateRoot = resolveStateRoot(cwd);
  const modelState = readJsonFile(stateRoot ? path.join(stateRoot, "model.json") : "", {});
  const strategy = normalizeStrategy(modelState.strategy);
  const stateLaneModels = normalizeModelMap(modelState.lane_models);
  const roleModels = normalizeModelMap(modelState.role_models);
  const defaultFastLane =
    typeof modelState.default_fast_lane === "string" && modelState.default_fast_lane.trim()
      ? modelState.default_fast_lane.trim()
      : null;
  const laneModels = Object.assign(Object.create(null), DEFAULT_LANE_MODELS, stateLaneModels);
  return {
    strategy,
    defaultFastLane,
    roleModels,
    laneModels,
  };
}

function resolveKnownRole(token, roleModels) {
  if (typeof token !== "string") {
    return null;
  }
  const lower = token.trim().toLowerCase();
  if (!lower) {
    return null;
  }
  if (lower === "research") {
    return {
      rawRole: lower,
      canonicalRole: "research",
      lane: "external_research",
    };
  }
  if (lower.startsWith("oma-") || lower.startsWith("omg-")) {
    const stem = lower.slice(4);
    if (Object.prototype.hasOwnProperty.call(ROLE_STEM_ROUTES, stem)) {
      const def = ROLE_STEM_ROUTES[stem];
      return {
        rawRole: lower,
        canonicalRole: def.canonicalRole,
        lane: def.lane,
      };
    }
  }
  if (roleModels && Object.prototype.hasOwnProperty.call(roleModels, lower)) {
    return {
      rawRole: lower,
      canonicalRole: lower,
      lane: "execution",
    };
  }
  return null;
}

const CANONICAL_IDENTITY_FIELDS = new Set([
  "agent",
  "agentname",
  "agenttype",
  "subagent",
  "subagentname",
  "subagenttype",
  "typename",
  "role",
  "rolename",
  "name",
]);

const CANONICAL_IDENTITY_CONTEXT_FIELDS = new Set([
  "caller",
  "context",
  "agentcontext",
  "subagentcontext",
]);

const NESTED_IDENTITY_VALUE_FIELDS = new Set([
  "id",
  "slug",
  "type",
  "value",
]);

const CANONICAL_LANE_FIELDS = new Set([
  "lane",
  "lanename",
]);

const FORBIDDEN_STRUCTURED_DESCENT_FIELDS = new Set([
  "prompt",
  "llmrequest",
  "systeminstruction",
]);

const MAX_TRAVERSAL_NODES = 50000;

function normalizeFieldKey(key) {
  return typeof key === "string" ? key.replace(/[_-\s]/g, "").toLowerCase() : "";
}

function projectHookEnvelope(hookInput) {
  const envelope = {
    cwd: "",
    incomingModel: "",
    incomingGenerationConfig: undefined,
    identityRoots: [],
    laneRoots: [],
    contextRoots: [],
    metadataRoots: [],
    promptRoots: [],
  };
  if (!isObject(hookInput)) {
    return envelope;
  }
  for (const [key, val] of Object.entries(hookInput)) {
    const norm = normalizeFieldKey(key);
    if (norm === "cwd") {
      if (!envelope.cwd && typeof val === "string" && val.trim()) {
        envelope.cwd = val.trim();
      }
      continue;
    }
    if (norm === "llmrequest") {
      if (isObject(val)) {
        for (const [reqKey, reqVal] of Object.entries(val)) {
          const reqNorm = normalizeFieldKey(reqKey);
          if (reqNorm === "model" && !envelope.incomingModel && typeof reqVal === "string" && reqVal.trim()) {
            envelope.incomingModel = reqVal.trim();
          } else if (
            reqNorm === "generationconfig" &&
            envelope.incomingGenerationConfig === undefined &&
            isObject(reqVal)
          ) {
            envelope.incomingGenerationConfig = reqVal;
          }
        }
      }
      continue;
    }
    if (norm === "systeminstruction") {
      continue;
    }
    if (norm === "prompt") {
      envelope.promptRoots.push(val);
      continue;
    }
    if (norm === "metadata") {
      envelope.metadataRoots.push(val);
      continue;
    }
    if (CANONICAL_IDENTITY_FIELDS.has(norm)) {
      envelope.identityRoots.push(val);
    } else if (CANONICAL_LANE_FIELDS.has(norm)) {
      envelope.laneRoots.push(val);
    } else if (CANONICAL_IDENTITY_CONTEXT_FIELDS.has(norm)) {
      envelope.contextRoots.push(val);
    }
  }
  return envelope;
}

function collectStructuredFieldStrings(
  roots,
  targetFields,
  initialMatched = false,
  allowNestedValueFields = false,
) {
  const out = [];
  const active = new WeakSet();
  const stack = [];
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ exit: false, node: roots[i], matched: initialMatched });
  }
  let visited = 0;
  while (stack.length > 0 && visited < MAX_TRAVERSAL_NODES) {
    const frame = stack.pop();
    if (frame.exit) {
      active.delete(frame.node);
      continue;
    }
    const { node, matched } = frame;
    if (node === null || node === undefined) {
      continue;
    }
    visited += 1;
    if (typeof node === "string") {
      if (matched && node.trim()) {
        out.push(node.trim());
      }
      continue;
    }
    if (typeof node !== "object") {
      continue;
    }
    if (active.has(node)) {
      continue;
    }
    active.add(node);
    stack.push({ exit: true, node, matched: false });

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        stack.push({ exit: false, node: node[i], matched });
      }
      continue;
    }

    if (isObject(node)) {
      const entries = Object.entries(node);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, val] = entries[i];
        const norm = normalizeFieldKey(key);
        if (FORBIDDEN_STRUCTURED_DESCENT_FIELDS.has(norm)) {
          continue;
        }
        const childMatched =
          targetFields.has(norm) ||
          (allowNestedValueFields && matched && NESTED_IDENTITY_VALUE_FIELDS.has(norm));
        stack.push({ exit: false, node: val, matched: childMatched });
      }
    }
  }
  return out;
}

function extractStructuredCandidates(envelope) {
  return [
    ...collectStructuredFieldStrings(envelope.identityRoots, CANONICAL_IDENTITY_FIELDS, true, true),
    ...collectStructuredFieldStrings(envelope.contextRoots, CANONICAL_IDENTITY_FIELDS, false, true),
    ...collectStructuredFieldStrings(envelope.metadataRoots, CANONICAL_IDENTITY_FIELDS, false, true),
  ];
}

function extractStructuredLanes(envelope) {
  return [
    ...collectStructuredFieldStrings(envelope.laneRoots, CANONICAL_LANE_FIELDS, true, false),
    ...collectStructuredFieldStrings(envelope.contextRoots, CANONICAL_LANE_FIELDS, false, false),
    ...collectStructuredFieldStrings(envelope.metadataRoots, CANONICAL_LANE_FIELDS, false, false),
  ];
}

function resolveKnownLane(token, laneModels) {
  if (typeof token !== "string") {
    return null;
  }
  const normalized = token.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) {
    return null;
  }
  if (
    (laneModels && Object.prototype.hasOwnProperty.call(laneModels, normalized)) ||
    Object.prototype.hasOwnProperty.call(DEFAULT_LANE_MODELS, normalized)
  ) {
    return normalized;
  }
  return null;
}

function collectText(roots, skipPromptFields = false) {
  const parts = [];
  const active = new WeakSet();
  const stack = [];
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ exit: false, node: roots[i] });
  }
  let visited = 0;
  while (stack.length > 0 && visited < MAX_TRAVERSAL_NODES) {
    const frame = stack.pop();
    if (frame.exit) {
      active.delete(frame.node);
      continue;
    }
    const { node } = frame;
    if (node === null || node === undefined) {
      continue;
    }
    visited += 1;
    if (typeof node === "string") {
      parts.push(node);
      continue;
    }
    if (typeof node !== "object") {
      continue;
    }
    if (active.has(node)) {
      continue;
    }
    active.add(node);
    stack.push({ exit: true, node });

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        stack.push({ exit: false, node: node[i] });
      }
      continue;
    }

    if (isObject(node)) {
      const entries = Object.entries(node);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, item] = entries[i];
        if (skipPromptFields && FORBIDDEN_STRUCTURED_DESCENT_FIELDS.has(normalizeFieldKey(key))) {
          continue;
        }
        stack.push({ exit: false, node: item });
      }
    }
  }
  return parts;
}

function matchTextRoleOrLane(text, policy, roleReasonPrefix) {
  PROMPT_ROLE_TOKEN_RX.lastIndex = 0;
  let match;
  while ((match = PROMPT_ROLE_TOKEN_RX.exec(text)) !== null) {
    const roleMatch = resolveKnownRole(match[0], policy?.roleModels);
    if (roleMatch) {
      return {
        role: roleMatch.canonicalRole,
        rawRole: roleMatch.rawRole,
        lane: roleMatch.lane,
        reason: `${roleReasonPrefix}:${roleMatch.canonicalRole}`,
        isFallback: false,
      };
    }
  }

  for (const { lane, label, patterns } of LANE_PATTERNS) {
    const matchedPattern = patterns.find((pattern) => pattern.test(text));
    if (matchedPattern) {
      return {
        role: null,
        rawRole: null,
        lane,
        reason: `${label}:${matchedPattern.source}`,
        isFallback: false,
      };
    }
  }

  return null;
}

function detectRoute(envelope, policy) {
  // 1a. Structured caller role identity (top-level and arbitrarily nested metadata/caller) wins first.
  for (const candidate of extractStructuredCandidates(envelope)) {
    const directMatch = resolveKnownRole(candidate, policy?.roleModels);
    if (directMatch) {
      return {
        role: directMatch.canonicalRole,
        rawRole: directMatch.rawRole,
        lane: directMatch.lane,
        reason: `agent:${directMatch.canonicalRole}`,
        isFallback: false,
      };
    }
    PROMPT_ROLE_TOKEN_RX.lastIndex = 0;
    let embedded;
    while ((embedded = PROMPT_ROLE_TOKEN_RX.exec(candidate)) !== null) {
      const tokenMatch = resolveKnownRole(embedded[0], policy?.roleModels);
      if (tokenMatch) {
        return {
          role: tokenMatch.canonicalRole,
          rawRole: tokenMatch.rawRole,
          lane: tokenMatch.lane,
          reason: `agent:${tokenMatch.canonicalRole}`,
          isFallback: false,
        };
      }
    }
  }

  // 1b. Structured caller lane identity (top-level or nested metadata) wins ahead of free-text fields.
  for (const laneCandidate of extractStructuredLanes(envelope)) {
    const knownLane = resolveKnownLane(laneCandidate, policy?.laneModels);
    if (knownLane) {
      return {
        role: null,
        rawRole: null,
        lane: knownLane,
        reason: `lane:${knownLane}`,
        isFallback: false,
      };
    }
  }

  // 2. Structured metadata text is scanned strictly BEFORE free-text prompt so prompt keywords can never hijack metadata.
  const metadataText = collectText(envelope.metadataRoots, true).join("\n");
  if (metadataText) {
    const metadataRoute = matchTextRoleOrLane(metadataText, policy, "metadata-role");
    if (metadataRoute) {
      return metadataRoute;
    }
  }

  // 3. Operator prompt text (never systemInstruction) is scanned only when no structured or metadata route matched.
  const promptText = collectText(envelope.promptRoots, false).join("\n");
  if (promptText) {
    const promptRoute = matchTextRoleOrLane(promptText, policy, "role");
    if (promptRoute) {
      return promptRoute;
    }
  }

  // 4. Unclassified fallback: preserve an explicit canonical Gemini 4 pin when present, else use default_fast_lane.
  return {
    role: null,
    rawRole: null,
    lane: "fast_execution",
    reason: "fallback:default-fast-lane",
    isFallback: true,
  };
}

// ---------------------------------------------------------------------------
// Gemini 3.5 Flash / 2.5 legacy schema normalization (retained for backward
// compatibility when custom/legacy models are requested).
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
  const warnings = [];
  if (!isObjectLike(generationConfig)) {
    return { generationConfig, warnings };
  }
  const next = { ...generationConfig };
  if (isObjectLike(next.thinkingConfig)) {
    next.thinkingConfig = { ...next.thinkingConfig };
  }

  if (GEMINI_3X_RX.test(model)) {
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

const routeFallbacks = new Map();

function readInaccessibleModels(stateRoot) {
  const out = new Set();
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const candidateFiles = [];
  if (stateRoot) {
    candidateFiles.push(path.join(stateRoot, "inaccessible-models.json"));
  }
  if (homeDir) {
    candidateFiles.push(path.join(homeDir, ".omg", "state", "inaccessible-models.json"));
  }
  for (const filePath of candidateFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = safeJsonParse(raw, null);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const norm = String(item).trim().toLowerCase();
            if (norm) out.add(norm);
          }
        } else if (isObject(parsed)) {
          for (const [key, val] of Object.entries(parsed)) {
            if (val) {
              const norm = String(key).trim().toLowerCase();
              if (norm) out.add(norm);
            }
          }
        }
      }
    } catch {}
  }
  return out;
}

function resolveTargetModel(route, policy, inaccessibleModels, incomingModel) {
  if (policy.strategy === "auto") {
    return "auto";
  }

  const cacheKey = route.role ? `role:${route.role}` : `lane:${route.lane}`;
  if (!route.isFallback && routeFallbacks.has(cacheKey)) {
    const cached = routeFallbacks.get(cacheKey);
    if (cached === "auto" || !inaccessibleModels.has(String(cached).toLowerCase())) {
      return cached;
    }
  }

  let model = null;
  if (route.rawRole && Object.prototype.hasOwnProperty.call(policy.roleModels, route.rawRole)) {
    model = policy.roleModels[route.rawRole];
  } else if (route.role && Object.prototype.hasOwnProperty.call(policy.roleModels, route.role)) {
    model = policy.roleModels[route.role];
  } else if (route.isFallback) {
    const trimmedIncoming = typeof incomingModel === "string" ? incomingModel.trim() : "";
    if (trimmedIncoming && CANONICAL_GEMINI4_RX.test(trimmedIncoming)) {
      model = trimmedIncoming;
    } else {
      model =
        policy.defaultFastLane ||
        policy.laneModels[route.lane] ||
        DEFAULT_LANE_MODELS[route.lane] ||
        DEFAULT_LANE_MODELS.execution;
    }
  } else {
    model = policy.laneModels[route.lane] || DEFAULT_LANE_MODELS[route.lane] || DEFAULT_LANE_MODELS.execution;
  }

  if (model && model !== "auto") {
    const lowerModel = model.toLowerCase();
    if (inaccessibleModels.has(lowerModel)) {
      const fallbackCandidates = [
        typeof process.env.AG_GEMINI_MODEL === "string" ? process.env.AG_GEMINI_MODEL.trim() : "",
        DEFAULT_LANE_MODELS.execution,
        policy.defaultFastLane || "",
        policy.laneModels?.fast_execution || "",
        DEFAULT_LANE_MODELS.fast_execution,
        DEFAULT_LANE_MODELS.quick_edit,
        "auto",
      ];
      let fallback = "auto";
      for (const candidate of fallbackCandidates) {
        if (!candidate) continue;
        if (candidate === "auto" || !inaccessibleModels.has(candidate.toLowerCase())) {
          fallback = candidate;
          break;
        }
      }

      process.stderr.write(
        `omg-model-router: lane ${route.lane} model ${model} inaccessible, falling back to AG_GEMINI_MODEL or default\n`,
      );
      if (!route.isFallback) {
        routeFallbacks.set(cacheKey, fallback);
      }
      return fallback;
    }
  }

  return model;
}

function writeRouterTrace(stateRoot, trace) {
  if (!stateRoot || !isOn(process.env[MODEL_ROUTING_TRACE_ENV])) {
    return;
  }

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(
      path.join(stateRoot, "model-router-last.json"),
      `${JSON.stringify(trace, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Trace writes are best-effort and must never affect model routing.
  }
}

async function main() {
  const rawInput = await readStdinText();
  const parsedInput = safeJsonParse(rawInput, {});
  const hookInput = isObject(parsedInput) ? parsedInput : {};
  const disabledHooks = parseCsvEnv(process.env[DISABLED_HOOKS_ENV]);
  if (
    isOff(process.env[MODEL_ROUTING_ENV]) ||
    isHookDisabled(disabledHooks, [...MODEL_HOOK_KEYS])
  ) {
    process.stdout.write(JSON.stringify(buildOutput("")));
    return;
  }

  const envelope = projectHookEnvelope(hookInput);
  const cwd = resolveSessionCwd(envelope.cwd);
  const stateRoot = resolveStateRoot(cwd);
  const policy = readModelPolicy(cwd);
  const route = detectRoute(envelope, policy);
  const inaccessibleModels = readInaccessibleModels(stateRoot);
  const incomingModel = envelope.incomingModel;
  const model = resolveTargetModel(route, policy, inaccessibleModels, incomingModel);

  writeRouterTrace(stateRoot, {
    updated_at: new Date().toISOString(),
    cwd,
    strategy: policy.strategy,
    role: route.role,
    lane: route.lane,
    model,
    reason: route.reason,
    source: "oma-model-router",
  });

  const incomingGenerationConfig = envelope.incomingGenerationConfig;
  let outgoingGenerationConfig;
  const warnings = [];
  if (model && model !== "auto" && isObjectLike(incomingGenerationConfig)) {
    const result = transformGenerationConfig(model, incomingGenerationConfig);
    if (result.warnings.length > 0) {
      outgoingGenerationConfig = result.generationConfig;
      warnings.push(...result.warnings);
    }
  } else if (model && model !== "auto" && GEMINI_35_FLASH_RX.test(model)) {
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
