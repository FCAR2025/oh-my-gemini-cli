---
name = "sciomg"
description = "Orchestrate parallel scientist lanes for comprehensive analysis with AUTO mode default."
---
Run OmG `sciomg` (parallel scientist analysis).

Topic:
$ARGUMENTS

Protocol:
1. Decompose the topic into 2-5 independent scientist lanes. Each lane gets a tight question and a budget. Default lane set when topic is ambiguous (`AUTO` mode):
   - `architecture`: structure, dependencies, hot paths
   - `correctness`: invariants, edge cases, failure modes
   - `security`: trust boundaries, secret handling, sandbox/escape risks
   - `performance`: I/O, allocation, retry/backoff, tail latency
   - `ux/operator`: surface that humans touch (CLI, slash cmds, error messages)
2. For each lane, fork a sub-prompt that runs READ-ONLY analysis bounded by the lane's question. Each sub-prompt must:
   - state the lane's question verbatim
   - cite file:line evidence for every claim
   - return a single best finding + 2-3 secondary findings + the smallest probe that would falsify the best finding
3. Run lanes in parallel when the runtime supports parallel sub-tasks; otherwise serialize but keep lane outputs strictly independent (no cross-lane contamination).
4. Synthesizer pass:
   - rank lane findings by severity * confidence
   - surface contradictions across lanes explicitly (X says A, Y says ¬A) — do not silently reconcile
   - produce one operator-facing top-3 recommendation list
5. Persist under `.omg/state/sciomg/<slug>/`:
   - `cycle-0-plan.md` — lane decomposition + budgets
   - `lane-<n>.md` — each lane's findings
   - `synthesis.md` — final ranked recommendations + contradictions
6. Read `.omg/state/session-lock.json` before mutating shared OmG state. Non-owners write under `.omg/state/sessions/[session-slug]/sciomg/<slug>/`.

Discipline:
- Lanes must NOT see each other's findings until synthesis — independence is the value.
- Do NOT deliver a lane that says "looks fine" without one falsifying probe; that masks risk.
- If a lane finds a hard blocker, surface it without waiting for other lanes.

Boundaries:
- Sciomg is read-only analysis. Implementation belongs to a follow-up `/omg:team-exec`, `/omg:goal`, or `/omg:debug` cycle.
- Cost-aware: each parallel lane multiplies token cost. Default to `gemini-3-flash-preview` per lane unless `architecture` or `security` lane is active, which justify Pro.

Response:
## Sciomg Plan
- lanes:
- mode: AUTO | custom

## Lane Board
| Lane | Question | Best Finding | Severity | Confidence |
| --- | --- | --- | --- | --- |

## Cross-Lane Contradictions
- ...

## Top 3 Recommendations
1. ...
2. ...
3. ...

## Recommended Next Command
- ...
