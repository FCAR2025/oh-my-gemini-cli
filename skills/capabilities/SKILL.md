---
name: "capabilities"
description: "Map a task to Gemini-native capabilities, model choices, and runtime/proxy constraints."
---
Run OmG Gemini capability planner.

Task:
$ARGUMENTS

Protocol:
1. Classify the task shape: coding, review, research, multimodal, data extraction, planning, interactive TUI, automation, or media/live.
2. Recommend Gemini 4 and Antigravity-native capabilities:
   - `gemini-4-carbon-high` / `gemini-4-carbon-medium` for large-context reasoning, planning, architecture, security review, and adversarial critique
   - `gemini-4-argon-high` / `gemini-4-argon-medium` for multi-file or systems implementation, root-cause debugging, TDD, code review, dependency audits, and acceptance verification
   - `gemini-4-hydrogen-xhigh` for fast deep diff review, tricky single-slice TDD, and rapid root-cause verification
   - `gemini-4-hydrogen-high` (default fast lane) for search, docs lookup, and standard scoped implementation; `gemini-4-hydrogen-medium` for editorial output; `gemini-4-hydrogen-low` for quick low-risk edits. See `.gemini/rules/agent-routing.md` and `context/oma-core.md`.
   - custom-tools model variants for heavy function/tool calling when available
   - structured outputs or JSON schema for machine-readable plans and acceptance matrices
   - function calling and MCP for tool orchestration
   - code execution for contained calculations, generated fixtures, or data validation
   - Google Search grounding or URL context for current external facts
   - multimodal inputs for screenshots, PDFs, audio/video, and images
   - native Plan Mode for read-only planning before code changes
   - extensions and hooks for repeatable workflow policy
3. Call out separate or proxy-limited API surfaces:
   - Live WebSocket, Files uploads, Batch/cache creation, embeddings, media generation, TTS, Veo, Imagen, and Lyria require native Gemini API routes unless the active proxy explicitly supports them.
4. Produce a concrete OmG route using the smallest sufficient path:
   - planning: `team-plan` -> `team-prd`
   - execution: `team-exec` -> `team-verify` -> `team-fix`
   - high-throughput local work: `ultrawork`
   - adversarial proof: `ultraqa`
   - current external facts: `research`
   - model policy: `model`
5. If filesystem tools are available, optionally write `.omg/state/capabilities.md` using lock discipline.

Response:
## Capability Fit
| Need | Gemini Capability | Model/Mode | Caveat |
| --- | --- | --- | --- |

## Recommended Route
1. ...
2. ...

## Runtime Constraints
- ...

## Recommended Next Command
- ...
