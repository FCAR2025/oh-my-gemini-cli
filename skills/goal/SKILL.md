---
name: goal
description: Run a goal-driven autonomous delivery loop until acceptance passes or a blocker is explicit.
---
Run OmG `goal` mode.

Objective:
$ARGUMENTS

Goal protocol:
1. Treat this invocation as explicitly approved for routine, non-destructive work.
2. Do not ask the user routine preference questions; make conservative assumptions and record them.
3. Capability checkpoint (FCAR addition): before the first cycle, run `/omg:capabilities` against the goal to confirm Gemini-native model/tool/proxy fit. Skip only if the goal is a trivial no-routing single-cycle task; otherwise record the capability decision in `## Assumptions`.
4. Run the full delivery path:
   - `team-plan`
   - `team-prd`
   - `taskboard`
   - `team-exec`
   - `team-verify`
   - `team-fix` when verification fails
5. Repeat `team-exec -> team-verify -> team-fix` until acceptance criteria pass, all tracked tasks are verified, a hard blocker is explicit, or max cycles are reached.
6. Default max cycles: 5 unless the user explicitly requested another limit.
7. Stop and report a blocker instead of continuing when an action is destructive, credential-sensitive, production-impacting, permission-denied, or requires Gemini CLI runtime approval that is not available.
8. Do not claim completion without verification evidence for each acceptance criterion.
9. Do not invoke `/omg:ultraqa` from inside a goal cycle; if the verifier reports `unknown`, escalate to the operator with the missing-evidence list rather than starting a nested adversarial loop.

State handling:
- Read `.omg/state/session-lock.json` before mutating shared workflow state.
- If filesystem tools are available:
  - if the current orchestration session owns the lock, update `.omg/state/workflow.md`, `.omg/state/taskboard.md`, and `.omg/state/checkpoint.md`
  - otherwise write session-local drafts under `.omg/state/sessions/[session-slug]/` and report the ownership conflict instead of overwriting shared state
- Include the assumed approval posture and cycle count in the state summary.

Runtime boundary:
- This command sets OmG orchestration posture only.
- It does not bypass Gemini CLI approval, sandbox, trusted-folder, shell, network, or policy controls.
- If runtime policy blocks a required action, stop with the exact approval/fallback need.

Output format:
## Mode
- goal
- max cycles:
- assumed approval:

## Goal Status
| Area | Status | Evidence |
| --- | --- | --- |
| acceptance criteria | ... | ... |
| taskboard | ... | ... |
| execution | ... | ... |
| verification | ... | ... |

## Cycle Board
| Cycle | Stage Result | Remaining TODO | Blockers |
| --- | --- | --- | --- |

## Assumptions
- ...

## Runtime Boundary
- ...

## Ship Decision
- ready / blocked / max-cycles-reached
