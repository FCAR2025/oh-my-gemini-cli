import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BOOTSTRAP_PATH = path.resolve(import.meta.dirname, "./hooks/scripts/hook-bootstrap.js");
const HOOK_PATH = path.resolve(import.meta.dirname, "./hooks/scripts/before-model-banner.js");
const TEMP_DIR = path.resolve(import.meta.dirname, "./temp-test-sandbox");

function runHook(stdin, env = {}, viaBootstrap = false) {
  const args = viaBootstrap ? [BOOTSTRAP_PATH, HOOK_PATH] : [HOOK_PATH];
  const result = spawnSync("node", args, {
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

test("Task 1: Verify DEFAULT_LANE_MODELS cover canonical Gemini 4 lanes and roles without model.json", () => {
  const emptyHome = path.join(TEMP_DIR, "empty-home");
  fs.mkdirSync(emptyHome, { recursive: true });
  const env = { HOME: emptyHome, OMG_STATE_ROOT: "" };

  const cases = [
    [{ prompt: "Design boundaries with oma-architect", cwd: TEMP_DIR }, "gemini-4-carbon-high"],
    [{ prompt: "Coordinate waves under oma-director", cwd: TEMP_DIR }, "gemini-4-carbon-high"],
    [{ prompt: "Let's plan this out under oma-planner", cwd: TEMP_DIR }, "gemini-4-carbon-medium"],
    [{ prompt: "implement this feature using oma-executor", cwd: TEMP_DIR }, "gemini-4-argon-high"],
    [{ prompt: "fix this typo oma-quick", cwd: TEMP_DIR }, "gemini-4-hydrogen-low"],
    [{ prompt: "review diff oma-reviewer", cwd: TEMP_DIR }, "gemini-4-argon-high"],
    [{ prompt: "check gates oma-verifier", cwd: TEMP_DIR }, "gemini-4-argon-medium"],
    [{ prompt: "lookup docs oma-researcher", cwd: TEMP_DIR }, "gemini-4-hydrogen-high"],
    [{ prompt: "polish changelog oma-editor", cwd: TEMP_DIR }, "gemini-4-hydrogen-medium"],
  ];

  for (const [payload, expected] of cases) {
    const res = runHook(payload, env);
    assert.strictEqual(
      res.stdout.hookSpecificOutput?.llm_request?.model,
      expected,
      `Failed for payload=${JSON.stringify(payload)}`
    );
  }
});

test("Task 2: State Root Precedence for lane_models and role_models", () => {
  const localStateDir = path.join(TEMP_DIR, ".omg", "state");
  const globalStateDir = path.join(TEMP_DIR, "global-home", ".omg", "state");
  const envStateDir = path.join(TEMP_DIR, "env-state");

  fs.mkdirSync(localStateDir, { recursive: true });
  fs.mkdirSync(globalStateDir, { recursive: true });
  fs.mkdirSync(envStateDir, { recursive: true });

  fs.writeFileSync(path.join(localStateDir, "model.json"), JSON.stringify({
    strategy: "balanced",
    lane_models: { planning: "local-model", architecture_security: "local-arch-lane" },
    role_models: { "oma-architect": "local-arch-role" },
  }));

  fs.writeFileSync(path.join(globalStateDir, "model.json"), JSON.stringify({
    strategy: "balanced",
    lane_models: { planning: "global-model" },
    role_models: { "oma-architect": "global-arch-role" },
  }));

  fs.writeFileSync(path.join(envStateDir, "model.json"), JSON.stringify({
    strategy: "balanced",
    lane_models: { planning: "env-model" },
    role_models: { "oma-architect": "env-arch-role" },
  }));

  // A. Custom OMG_STATE_ROOT env takes top precedence
  const resEnv = runHook(
    { prompt: "oma-planner", cwd: TEMP_DIR },
    { OMG_STATE_ROOT: envStateDir, HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resEnv.stdout.hookSpecificOutput?.llm_request?.model, "env-model");

  const resEnvRole = runHook(
    { agent: "oma-architect", prompt: "Inspect boundaries", cwd: TEMP_DIR },
    { OMG_STATE_ROOT: envStateDir, HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resEnvRole.stdout.hookSpecificOutput?.llm_request?.model, "env-arch-role");

  // B. Local cwd-local model.json takes precedence over $HOME global model.json, and role_models overrides lane_models
  const resLocal = runHook(
    { prompt: "oma-planner", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resLocal.stdout.hookSpecificOutput?.llm_request?.model, "local-model");

  const resLocalRole = runHook(
    { agent: "oma-architect", prompt: "Inspect boundaries", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resLocalRole.stdout.hookSpecificOutput?.llm_request?.model, "local-arch-role");

  // C. Fallback to $HOME global model.json if cwd-local model.json does not exist
  fs.unlinkSync(path.join(localStateDir, "model.json"));
  const resGlobal = runHook(
    { prompt: "oma-planner", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resGlobal.stdout.hookSpecificOutput?.llm_request?.model, "global-model");

  const resGlobalRole = runHook(
    { agent: "oma-architect", prompt: "Inspect boundaries", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resGlobalRole.stdout.hookSpecificOutput?.llm_request?.model, "global-arch-role");
});

test("Task 3: Filter inaccessible models and fallback gracefully", () => {
  const localModelJson = path.join(TEMP_DIR, ".omg", "state", "model.json");
  if (fs.existsSync(localModelJson)) fs.unlinkSync(localModelJson);
  const globalStateDir = path.join(TEMP_DIR, "global-home", ".omg", "state");
  const globalModelJson = path.join(globalStateDir, "model.json");
  if (fs.existsSync(globalModelJson)) fs.unlinkSync(globalModelJson);

  fs.mkdirSync(globalStateDir, { recursive: true });

  fs.writeFileSync(
    path.join(globalStateDir, "inaccessible-models.json"),
    JSON.stringify(["gemini-4-carbon-medium"])
  );

  const resFallbackDefault = runHook(
    { prompt: "oma-planner", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resFallbackDefault.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-argon-high");
  assert.match(resFallbackDefault.stderr, /omg-model-router: lane planning model gemini-4-carbon-medium inaccessible, falling back/);

  const resFallbackEnv = runHook(
    { prompt: "oma-planner", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home"), AG_GEMINI_MODEL: "my-custom-fallback-model" }
  );
  assert.strictEqual(resFallbackEnv.stdout.hookSpecificOutput?.llm_request?.model, "my-custom-fallback-model");

  fs.writeFileSync(
    path.join(globalStateDir, "inaccessible-models.json"),
    JSON.stringify({ "gemini-4-carbon-medium": true })
  );
  const resFallbackObj = runHook(
    { prompt: "oma-planner", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home") }
  );
  assert.strictEqual(resFallbackObj.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-argon-high");

  // Multi-tier step-down: when execution (gemini-4-argon-high) is ALSO inaccessible, must step down to fast_execution (gemini-4-hydrogen-high) instead of returning an inaccessible model
  fs.writeFileSync(
    path.join(globalStateDir, "inaccessible-models.json"),
    JSON.stringify(["gemini-4-carbon-medium", "gemini-4-argon-high"])
  );
  const resMultiStep = runHook(
    { prompt: "oma-planner", cwd: TEMP_DIR },
    { HOME: path.join(TEMP_DIR, "global-home"), AG_GEMINI_MODEL: "" }
  );
  assert.strictEqual(resMultiStep.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-hydrogen-high");
});

test("Task 4: Orbit router trace (v0.9.2) writes model-router-last.json when OMG_MODEL_ROUTING_TRACE=1", () => {
  const traceStateDir = path.join(TEMP_DIR, "trace-state");
  fs.mkdirSync(traceStateDir, { recursive: true });
  const traceFile = path.join(traceStateDir, "model-router-last.json");

  runHook(
    { prompt: "oma-architect design review", cwd: TEMP_DIR },
    { OMG_STATE_ROOT: traceStateDir }
  );
  assert.strictEqual(fs.existsSync(traceFile), false);

  const resTrace = runHook(
    { prompt: "oma-executor implement feature", cwd: TEMP_DIR },
    { OMG_STATE_ROOT: traceStateDir, OMG_MODEL_ROUTING_TRACE: "1" }
  );
  assert.strictEqual(resTrace.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-argon-high");
  assert.strictEqual(fs.existsSync(traceFile), true);

  const traceData = JSON.parse(fs.readFileSync(traceFile, "utf8"));
  assert.strictEqual(traceData.strategy, "balanced");
  assert.strictEqual(traceData.lane, "execution");
  assert.strictEqual(traceData.model, "gemini-4-argon-high");
  assert.strictEqual(traceData.source, "oma-model-router");
  assert.ok(traceData.reason);
  assert.ok(traceData.updated_at);
});

test("Task 5: Registered hook-bootstrap honors all 19 role_models, resists prompt hijack, and preserves explicit Gemini 4 pins", () => {
  const modelJsonPath = path.join("/home/info", ".omg", "state", "model.json");
  const livePolicy = JSON.parse(fs.readFileSync(modelJsonPath, "utf8"));

  // Every configured role_models entry must resolve to its exact model via hook-bootstrap.js
  for (const [role, expectedModel] of Object.entries(livePolicy.role_models)) {
    const res = runHook(
      {
        cwd: "/home/info",
        agent: role,
        prompt: "Perform assigned role work.",
        llm_request: { model: expectedModel },
      },
      { PATH: "/usr/bin:/bin", HOME: "/home/info", OMG_MODEL_ROUTING_TRACE: "0", OMG_STATE_ROOT: "" },
      true
    );
    assert.strictEqual(
      res.stdout.hookSpecificOutput?.llm_request?.model,
      expectedModel,
      `Role ${role} mismatched: got ${res.stdout.hookSpecificOutput?.llm_request?.model}, expected ${expectedModel}`
    );
  }

  // Structured agent field must NOT be hijacked by prompt text mentioning quick_edit / flash-lite / oma-quick
  const hijackAttempt = runHook(
    {
      cwd: "/home/info",
      agent: "oma-architect",
      prompt: "Audit whether oma-quick or flash-lite quick_edit low-risk fix could cause a bug.",
      llm_request: { model: "gemini-4-carbon-high" },
    },
    { PATH: "/usr/bin:/bin", HOME: "/home/info", OMG_MODEL_ROUTING_TRACE: "0", OMG_STATE_ROOT: "" },
    true
  );
  assert.strictEqual(hijackAttempt.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-carbon-high");

  // Unclassified prompt preserves an explicit canonical gemini-4-* model pin (e.g. swarm/CLI --model)
  const explicitPin = runHook(
    {
      cwd: "/home/info",
      prompt: "Summarize module boundaries.",
      llm_request: { model: "gemini-4-hydrogen-xhigh" },
    },
    { PATH: "/usr/bin:/bin", HOME: "/home/info", OMG_MODEL_ROUTING_TRACE: "0", OMG_STATE_ROOT: "" },
    true
  );
  assert.strictEqual(explicitPin.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-hydrogen-xhigh");

  // Unclassified prompt with no explicit Gemini 4 model falls back to default_fast_lane
  const defaultFast = runHook(
    {
      cwd: "/home/info",
      prompt: "Summarize module boundaries.",
    },
    { PATH: "/usr/bin:/bin", HOME: "/home/info", OMG_MODEL_ROUTING_TRACE: "0", OMG_STATE_ROOT: "" },
    true
  );
  assert.strictEqual(defaultFast.stdout.hookSpecificOutput?.llm_request?.model, livePolicy.default_fast_lane);
});

test("Task 6: Nested metadata identity, metadata-over-prompt precedence, non-object stdin, and OMG_EXTENSION_PATH bootstrap", () => {
  const baseEnv = { PATH: "/usr/bin:/bin", HOME: "/home/info", OMG_MODEL_ROUTING_TRACE: "0", OMG_STATE_ROOT: "" };

  // 1. Verbatim Cycle 4 Finding 1 reproduction
  const cycle4Repro = runHook(
    {
      cwd: "/home/info",
      metadata: { subagent_name: "oma-architect" },
      prompt: "oma-quick flash-lite quick_edit",
      llm_request: { model: "gemini-4-carbon-high" },
    },
    baseEnv,
    true
  );
  assert.strictEqual(cycle4Repro.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-carbon-high");

  // 2. Symmetry across snake_case, camelCase, PascalCase, and deeply nested metadata/caller identity fields
  const identityKeys = [
    "agent",
    "agent_name",
    "agentName",
    "AgentName",
    "subagent",
    "subagent_name",
    "subagentName",
    "SubagentName",
    "type_name",
    "typeName",
    "TypeName",
    "role",
    "role_name",
    "name",
  ];
  for (const key of identityKeys) {
    for (const payload of [
      { cwd: "/home/info", [key]: "oma-architect", prompt: "oma-quick flash-lite quick_edit" },
      { cwd: "/home/info", metadata: { [key]: "oma-architect" }, prompt: "oma-quick flash-lite quick_edit" },
      { cwd: "/home/info", metadata: { dispatch: { caller: { [key]: "oma-architect" } } }, prompt: "oma-quick flash-lite quick_edit" },
    ]) {
      const res = runHook(payload, baseEnv, true);
      assert.strictEqual(
        res.stdout.hookSpecificOutput?.llm_request?.model,
        "gemini-4-carbon-high",
        `Identity key ${key} failed for payload=${JSON.stringify(payload)}`
      );
    }
  }

  // 3. Multi-token embedded role candidate in structured metadata (first oma-* unknown, second known)
  const multiToken = runHook(
    {
      cwd: "/home/info",
      metadata: { subagent_name: "oma-wrapper -> oma-architect" },
      prompt: "oma-quick flash-lite quick_edit",
    },
    baseEnv,
    true
  );
  assert.strictEqual(multiToken.stdout.hookSpecificOutput?.llm_request?.model, "gemini-4-carbon-high");

  // 4. Structured lane and arbitrary metadata fields beat conflicting prompt text
  for (const [meta, expected] of [
    [{ lane: "execution" }, "gemini-4-argon-high"],
    [{ custom_target: "oma-architect" }, "gemini-4-carbon-high"],
    [{ command: "/oma:consensus" }, "gemini-4-carbon-high"],
  ]) {
    const res = runHook(
      { cwd: "/home/info", metadata: meta, prompt: "oma-quick flash-lite quick_edit" },
      baseEnv,
      true
    );
    assert.strictEqual(
      res.stdout.hookSpecificOutput?.llm_request?.model,
      expected,
      `Metadata precedence failed for metadata=${JSON.stringify(meta)}`
    );
  }

  // 5. Non-object JSON stdin (null, array, primitive) never crashes
  for (const raw of ["null", "[]", "\"str\"", "123"]) {
    const res = spawnSync("node", [BOOTSTRAP_PATH, HOOK_PATH], {
      input: raw,
      env: { ...process.env, ...baseEnv },
      encoding: "utf8",
    });
    assert.strictEqual(res.status, 0);
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.decision, "allow");
  }

  // 6. OMG_EXTENSION_PATH set alongside an already-absolute target path (matching hooks.json) still routes
  const extDir = path.resolve(import.meta.dirname);
  const resWithExtEnv = spawnSync("node", [BOOTSTRAP_PATH, HOOK_PATH], {
    cwd: "/opt/agentic/launchpad",
    input: JSON.stringify({
      cwd: "/home/info",
      metadata: { subagent_name: "oma-architect" },
      prompt: "oma-quick flash-lite quick_edit",
    }),
    env: { ...process.env, ...baseEnv, OMG_EXTENSION_PATH: extDir },
    encoding: "utf8",
  });
  assert.strictEqual(resWithExtEnv.status, 0);
  assert.strictEqual(
    JSON.parse(resWithExtEnv.stdout).hookSpecificOutput?.llm_request?.model,
    "gemini-4-carbon-high"
  );

  // 7. Deep nesting (depths 8, 32, 128) must never be truncated or overridden by hostile prompt text
  for (const depth of [8, 32, 128]) {
    let deepId = { subagent_name: "oma-architect" };
    let deepLane = { lane: "execution" };
    let deepText = { note: "oma-architect" };
    for (let i = 0; i < depth; i++) {
      deepId = { child: deepId };
      deepLane = { child: [deepLane] };
      deepText = { child: deepText };
    }
    assert.strictEqual(
      runHook({ cwd: "/home/info", metadata: deepId, prompt: "oma-quick flash-lite quick_edit" }, baseEnv, true)
        .stdout.hookSpecificOutput?.llm_request?.model,
      "gemini-4-carbon-high",
      `Deep identity failed at depth=${depth}`
    );
    assert.strictEqual(
      runHook({ cwd: "/home/info", metadata: deepLane, prompt: "oma-quick flash-lite quick_edit" }, baseEnv, true)
        .stdout.hookSpecificOutput?.llm_request?.model,
      "gemini-4-argon-high",
      `Deep lane failed at depth=${depth}`
    );
    assert.strictEqual(
      runHook({ cwd: "/home/info", metadata: deepText, prompt: "oma-quick flash-lite quick_edit" }, baseEnv, true)
        .stdout.hookSpecificOutput?.llm_request?.model,
      "gemini-4-carbon-high",
      `Deep metadata text failed at depth=${depth}`
    );
  }

  // 8. PascalCase / UPPERCASE top-level envelope keys (Metadata, METADATA, Cwd, Prompt, LlmRequest)
  for (const payload of [
    {
      Cwd: "/home/info",
      Metadata: { SubagentName: "oma-architect" },
      Prompt: "oma-quick flash-lite quick_edit",
      LlmRequest: { Model: "gemini-4-carbon-high" },
    },
    {
      CWD: "/home/info",
      METADATA: { custom_field: "/oma:consensus" },
      PROMPT: "oma-quick flash-lite quick_edit",
    },
    {
      Cwd: "/home/info",
      Prompt: "Summarize module boundaries.",
      LlmRequest: { Model: "gemini-4-hydrogen-xhigh" },
    },
  ]) {
    const expected = payload.LlmRequest?.Model === "gemini-4-hydrogen-xhigh" ? "gemini-4-hydrogen-xhigh" : "gemini-4-carbon-high";
    assert.strictEqual(
      runHook(payload, baseEnv, true).stdout.hookSpecificOutput?.llm_request?.model,
      expected,
      `Envelope casing failed for payload=${JSON.stringify(payload)}`
    );
  }
});

test("Task 7: Package validators (version, YAML/TOML skill metadata, command parity) pass cleanly", async () => {
  const repoRoot = path.resolve(import.meta.dirname);
  for (const script of [
    "scripts/check-version.js",
    "scripts/check-skill-metadata.js",
    "scripts/check-command-parity.js",
  ]) {
    const res = spawnSync("node", [path.join(repoRoot, script)], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.strictEqual(res.status, 0, `${script} failed:\n${res.stderr || res.stdout}`);
  }

  const { parseFrontmatter } = await import("./scripts/check-skill-metadata.js");
  assert.deepStrictEqual(
    parseFrontmatter('---\nname: "ultraqa"\ndescription: "Run \\"adversarial\\" QA cycles."\n---\nBody\n'),
    { data: { name: "ultraqa", description: 'Run "adversarial" QA cycles.' } }
  );
  assert.deepStrictEqual(
    parseFrontmatter("---\nname: ultraqa\ndescription: 'Single quoted summary'\n---\nBody\n"),
    { data: { name: "ultraqa", description: "Single quoted summary" } }
  );
  assert.deepStrictEqual(
    parseFrontmatter('---\nname = "legacy-skill"\ndescription = "Legacy TOML frontmatter"\n---\nBody\n'),
    { data: { name: "legacy-skill", description: "Legacy TOML frontmatter" } }
  );
  assert.match(
    parseFrontmatter('---\nname: "dup"\nname: "dup2"\n---\n').error || "",
    /duplicate frontmatter key/
  );
  assert.match(
    parseFrontmatter("---\nnot a valid line\n---\n").error || "",
    /invalid frontmatter line/
  );
});
