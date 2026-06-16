---
name = "analyze"
description = "Read-only code analysis lane — answer 'what does this do, where is risk, what would break' without editing."
---
Run OmG `analyze`.

Target:
$ARGUMENTS

Protocol:
1. Resolve scope: a file, directory, glob, function name, symbol, or free-text question. If ambiguous, ask the user once, then proceed.
2. Read-only posture: do NOT edit, run, or stage anything. No `write_file`, no shell side-effects beyond `list_directory`/`read_file` (and read-only grep/find via shell when filesystem tools are unavailable).
3. Capability fit: classify the analysis shape and pick a Gemini surface:
   - large cross-file audit -> `gemini-3.1-pro-preview` with large context
   - single-file or hot-spot -> `gemini-3-flash-preview` is enough
   - external API/SDK behavior questions -> Google Search grounding only when current external facts matter
4. Map the target:
   - structure (key files, entry points, exports)
   - dependencies (imports, runtime services, external calls)
   - data flow (where state enters/exits, mutation boundaries)
   - hot paths (what runs in the steady-state vs cold paths)
5. Surface risk:
   - correctness (logic, edge cases, missing input validation)
   - security (boundary trust, secret/credential handling, deserialization)
   - performance (loops, retries, allocation, I/O patterns)
   - maintainability (duplication, file LOC budget, abstractions that don't pay rent)
6. Write the analysis to `.omg/state/analyze.md` (single-writer; respect `.omg/state/session-lock.json`). For delegated/worker turns, write under `.omg/state/sessions/[session-slug]/analyze.md` and report ownership.
7. End with the smallest concrete probe a follow-up turn could run to falsify the riskiest claim.

Response:
## Analysis Scope
- target:
- model lane:

## Map
| Layer | Files | Notes |
| --- | --- | --- |

## Risks
| # | Severity | Risk | Evidence (file:line) | Suggested next probe |
| --- | --- | --- | --- | --- |

## Open Questions
- ...

## Recommended Next Command
- ...
