---
name: ask
description: Single-advisor invocation primitive — ask one external/peer agent and capture an artifact.
---
Run OmG `ask`.

Input:
$ARGUMENTS

Protocol:
1. Parse the first token of `$ARGUMENTS` as the advisor identity:
   - `claude` (peer Claude Code via omc)
   - `codex` (peer OpenAI Codex via omx)
   - `gemini` (this runtime; useful for second-opinion against a different model id)
   - `self` (route to a Gemini-native role/agent in this OmG installation)
2. Treat the rest of `$ARGUMENTS` as the prompt to the advisor.
3. Routing surface:
   - `claude`/`codex` -> route via `omc ask claude|codex` if available; otherwise stop with `cli not available, install omc/omx first` and explain the install path.
   - `gemini` -> use a different model variant (`gemini-3.1-pro-preview` if current lane was Flash; `gemini-3-flash-preview` if current lane was Pro) for an independent perspective.
   - `self` -> dispatch to the matching `omg-*` agent under `agents/`.
4. Capture the response into a per-call artifact under `.omg/state/ask/` with filename pattern `<advisor>-<slug>-<iso-timestamp>.md` and the structure:
   - Original task
   - Final prompt (after any role injection)
   - Raw output (in a fenced block)
   - Concise summary (one paragraph)
   - Action items (bulleted)
5. Read `.omg/state/session-lock.json` before mutating shared OmG state.
6. If the advisor is unreachable (no CLI / 4xx / runtime denial), report it explicitly with the failed command and exit `blocked`. Do not silently fall back to the local model.

Boundaries:
- This command never edits source files itself; it only requests and captures advice.
- Do not invoke `/omg:ask` from inside `/omg:goal` cycles; goal mode escalates `unknown` to the operator instead.

Response:
## Ask Result
- advisor: claude | codex | gemini | self
- status: ok | blocked
- artifact: <path>

## Summary
- ...

## Action Items
- ...

## Recommended Next Command
- ...
