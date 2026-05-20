import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOOK_PATH = path.resolve("./hooks/scripts/before-model-banner.js");
const TEMP_DIR = path.resolve("./temp-test-sandbox");

// Helper to run the hook script
function runHook(stdin, env = {}) {
  const result = spawnSync("node", [HOOK_PATH], {
    input: JSON.stringify(stdin),
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
  
  let stdoutJson = {};
  try {
    stdoutJson = JSON.parse(result.stdout || "{}");
  } catch (e) {
    console.error("Failed to parse stdout:", result.stdout);
  }
  
  return {
    status: result.status,
    stdout: stdoutJson,
    stderr: result.stderr || "",
  };
}

test.before(() => {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });
});

test.after(() => {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
});

test("Task 1: Verify DEFAULT_LANE_MODELS are updated to accessible-by-default models", () => {
  // Test planning lane -> should map to gemini-pro-agent
  const resPlanning = runHook({
    prompt: "Let's plan this out under omg-director",
    cwd: TEMP_DIR
  });
  assert.strictEqual(resPlanning.stdout.hookSpecificOutput?.llm_request?.model, "gemini-pro-agent");
  
  // Test execution lane -> should map to gemini-3-flash-agent
  const resExecution = runHook({
    prompt: "implement this feature using omg-executor",
    cwd: TEMP_DIR
  });
  assert.strictEqual(resExecution.stdout.hookSpecificOutput?.llm_request?.model, "gemini-3-flash-agent");
  
  // Test quick_edit lane -> should map to gemini-3.5-flash-low
  const resQuickEdit = runHook({
    prompt: "fix this typo omg-quick",
    cwd: TEMP_DIR
  });
  assert.strictEqual(resQuickEdit.stdout.hookSpecificOutput?.llm_request?.model, "gemini-3.5-flash-low");

  // Test review_verify lane -> should map to gemini-pro-agent
  const resReviewVerify = runHook({
    prompt: "verify tests pass omg-reviewer",
    cwd: TEMP_DIR
  });
  assert.strictEqual(resReviewVerify.stdout.hookSpecificOutput?.llm_request?.model, "gemini-pro-agent");
});

test("Task 2: State Root Precedence", () => {
  const localStateDir = path.join(TEMP_DIR, ".omg", "state");
  const globalStateDir = path.join(TEMP_DIR, "global-home", ".omg", "state");
  const envStateDir = path.join(TEMP_DIR, "env-state");

  fs.mkdirSync(localStateDir, { recursive: true });
  fs.mkdirSync(globalStateDir, { recursive: true });
  fs.mkdirSync(envStateDir, { recursive: true });

  // 1. Write unique lane models to each state root
  fs.writeFileSync(path.join(localStateDir, "model.json"), JSON.stringify({
    strategy: "balanced",
    lane_models: { planning: "local-model" }
  }));

  fs.writeFileSync(path.join(globalStateDir, "model.json"), JSON.stringify({
    strategy: "balanced",
    lane_models: { planning: "global-model" }
  }));

  fs.writeFileSync(path.join(envStateDir, "model.json"), JSON.stringify({
    strategy: "balanced",
    lane_models: { planning: "env-model" }
  }));

  // A. Test custom OMG_STATE_ROOT env takes top precedence
  const resEnv = runHook(
    { prompt: "omg-director", cwd: TEMP_DIR },
    { OMG_STATE_ROOT: envStateDir, HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resEnv.stdout.hookSpecificOutput?.llm_request?.model, "env-model");

  // B. Test local cwd-local model.json takes precedence over $HOME global model.json
  const resLocal = runHook(
    { prompt: "omg-director", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resLocal.stdout.hookSpecificOutput?.llm_request?.model, "local-model");

  // C. Test fallback to $HOME global model.json if cwd-local model.json does not exist
  fs.unlinkSync(path.join(localStateDir, "model.json"));
  const resGlobal = runHook(
    { prompt: "omg-director", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resGlobal.stdout.hookSpecificOutput?.llm_request?.model, "global-model");
});

test("Task 3: Filter inaccessible models and fallback gracefully", () => {
  // Clear any existing model.json from previous tests so defaults are used
  const localModelJson = path.join(TEMP_DIR, ".omg", "state", "model.json");
  if (fs.existsSync(localModelJson)) fs.unlinkSync(localModelJson);
  const globalStateDir = path.join(TEMP_DIR, "global-home", ".omg", "state");
  const globalModelJson = path.join(globalStateDir, "model.json");
  if (fs.existsSync(globalModelJson)) fs.unlinkSync(globalModelJson);

  fs.mkdirSync(globalStateDir, { recursive: true });

  // Mark "gemini-pro-agent" (default planning model) as inaccessible
  fs.writeFileSync(
    path.join(globalStateDir, "inaccessible-models.json"),
    JSON.stringify(["gemini-pro-agent"])
  );

  // A. Test fallback to DEFAULT_LANE_MODELS.execution when AG_GEMINI_MODEL is not set
  const resFallbackDefault = runHook(
    { prompt: "omg-director", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resFallbackDefault.stdout.hookSpecificOutput?.llm_request?.model, "gemini-3-flash-agent");
  assert.match(resFallbackDefault.stderr, /omg-model-router: lane planning model gemini-pro-agent inaccessible, falling back/);

  // B. Test fallback to process.env.AG_GEMINI_MODEL when set
  const resFallbackEnv = runHook(
    { prompt: "omg-director", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home"), AG_GEMINI_MODEL: "my-custom-fallback-model" }
  );
  assert.strictEqual(resFallbackEnv.stdout.hookSpecificOutput?.llm_request?.model, "my-custom-fallback-model");

  // C. Test that fallback works even if inaccessible-models.json is a JSON object keys instead of an array
  fs.writeFileSync(
    path.join(globalStateDir, "inaccessible-models.json"),
    JSON.stringify({ "gemini-pro-agent": true })
  );
  const resFallbackObj = runHook(
    { prompt: "omg-director", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resFallbackObj.stdout.hookSpecificOutput?.llm_request?.model, "gemini-3-flash-agent");
});
