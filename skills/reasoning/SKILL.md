---
name: "reasoning"
description: "Inspect or set OmG reasoning effort profile (global + per-teammate overrides) for Gemini 4 depth/cost control."
---
Run OmG reasoning-effort manager.

Input:
$ARGUMENTS

Protocol:
1. Parse requested global effort value and optional teammate overrides.
   - example: `global=high oma-architect=high omg-critic=high oma-executor=high oma-researcher=high oma-quick=low fast_deep_single_slice=xhigh`
2. Supported values:
   - `low` (e.g. `gemini-4-hydrogen-low` for `oma-quick`)
   - `medium` (e.g. `gemini-4-carbon-medium` for planning/product/consultant/interview, `gemini-4-argon-medium` for `oma-verifier`, `gemini-4-hydrogen-medium` for `oma-editor`)
   - `high` (e.g. `gemini-4-carbon-high` for architecture/critic/security/consensus/director, `gemini-4-argon-high` for complex execution/debugging/TDD/review/dependencies, `gemini-4-hydrogen-high` for research and standard scoped execution)
   - `xhigh` (e.g. `gemini-4-hydrogen-xhigh` for fast deep code/diff review, tricky single-slice adapter TDD, and rapid root-cause verification)
3. If no value is provided, show current profile from `.omg/state/reasoning.json` when available.
4. Map global effort to OmG posture:
   - planning depth
   - verification strictness
   - expected latency/token cost
5. If teammate overrides are provided, apply them only to listed roles and keep the global default for others.
6. Read `.omg/state/session-lock.json` before mutating shared reasoning state if present.
7. If filesystem tools are available:
   - if the current orchestration session owns the lock (or no session lock is active), write/update `.omg/state/reasoning.json`
   - otherwise write `.omg/state/sessions/[session-slug]/reasoning.json` instead and report the ownership conflict
8. Clarify boundary: this profile controls OmG orchestration behavior and pairs with Gemini 4 effort-suffixed model IDs (`-low`, `-medium`, `-high`, `-xhigh`) in `swarm` dispatch.

Suggested `reasoning.json` shape:
{
  "effort": "low|medium|high|xhigh",
  "planning_depth": "minimal|balanced|deep|maximum",
  "verification_strictness": "light|normal|high|very-high",
  "team_overrides": {
    "oma-architect": "high",
    "omg-critic": "high",
    "omg-security-reviewer": "high",
    "oma-planner": "medium",
    "oma-executor": "high",
    "oma-debugger": "high",
    "omg-test-engineer": "high",
    "oma-reviewer": "high",
    "oma-verifier": "medium",
    "oma-researcher": "high",
    "oma-editor": "medium",
    "oma-quick": "low",
    "fast_deep_single_slice": "xhigh"
  },
  "updated_at": "<ISO-8601>",
  "source": "omg:reasoning"
}

Response:
- Keep it concise and operator-facing.
- Include `Reasoning Status`, `Effort Matrix`, `Team Overrides`, and `Recommended Route`.
