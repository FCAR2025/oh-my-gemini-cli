---
name: "team-assemble"
description: "Stage 0/5: Dynamically assemble a task-fit agent team with approval gating and model-aware role assignment."
---
Run OmG `team-assemble`.

Task:
$ARGUMENTS

Protocol:
1. Analyze task shape:
   - domain (engineering/research/analysis/content/ops/hybrid)
   - output target (code/report/plan/presentation)
   - risk and verification needs
2. Assemble two role groups:
   - domain specialists (problem-space experts)
   - format specialists (output-quality experts)
3. Build role lanes from registered OmA/OmG agents (`agents/*.md`):
   - orchestration lane: `oma-director`
   - exploration lane: `oma-researcher` or `research` (spawn multiple lanes when breadth is high)
   - decision/critique lane: `oma-consultant`, `oma-architect`, `oma-consensus`, `omg-critic`, or `omg-security-reviewer`
   - execution lane: `oma-executor` when implementation is required (`omg-test-engineer` for TDD, `omg-dependency-expert` for dependencies)
   - quality lane: `oma-reviewer`, `oma-verifier`, `oma-debugger`
   - editorial lane: `oma-editor` for final packaging
4. Assign Gemini 4 model profiles by lane (pin via `swarm` `action: "add"` `model`):
   - architecture, adversarial critique, security, and orchestration -> `gemini-4-carbon-high` (`gemini-4-carbon-medium` for planning/PRD/discovery)
   - complex implementation, debugging, TDD, review, and dependency audits -> `gemini-4-argon-high` (`gemini-4-argon-medium` for acceptance verification)
   - fast deep review or tricky single-slice TDD -> `gemini-4-hydrogen-xhigh`; standard scoped execution and exploration -> `gemini-4-hydrogen-high`; docs -> `gemini-4-hydrogen-medium`; trivial localized edits -> `gemini-4-hydrogen-low`
5. Assign reasoning effort per lane:
   - load `.omg/state/reasoning.json` when available
   - apply teammate overrides first, then global default
   - use higher effort for reviewer/verifier lanes on high-risk tasks
6. Define collaboration protocol:
   - classify tasks into critical path vs sidecar parallel lanes
   - keep immediate blockers on the active lane; parallelize only independent sidecars
   - use deterministic execution ordering (`p0` -> `p3`) with default `p2` when priority is unknown
   - explicit message flow between lanes
   - workspace/worktree lane ownership when `.omg/state/workspace.json` exists
   - lane cleanliness/trust notes when `.omg/state/workspace.json` exists
   - explicit subagent handoff schema (`owner`, `lane`, `evidence`, `termination`)
   - agent-unavailable fallback map (for example `oma-executor` -> `oma-quick` once for low-risk slices)
   - avoid duplicate unresolved delegation across lanes
   - trigger conditions for verify/fix loops
   - anti-slop quality gate before final delivery
   - fallback path when evidence conflicts, execution fails, or permissions are denied
7. Confirmation gate:
   - If input includes explicit approval tokens (`approve`, `approved`, `yes`, `go`, `run`), proceed to execution.
   - Otherwise stop after team proposal and ask: "Proceed with this team? (yes/no)"
8. Approved execution path:
   - Run `team-plan -> team-prd -> taskboard -> team-exec -> team-verify -> team-fix`.
   - Repeat `team-exec -> team-verify -> team-fix` until criteria pass, tracked tasks are verified, or blockers are explicit.
9. Read `.omg/state/session-lock.json` before mutating shared workflow state.
10. If filesystem tools are available:
   - write/update `.omg/state/team-assembly.md`
   - if the current orchestration session owns the lock, write/update `.omg/state/workflow.md`
   - otherwise write `.omg/state/sessions/[session-slug]/workflow.md` instead of overwriting shared workflow state

Response:
- Keep it concise and operator-facing.
- Include `Team Fit Analysis`, `Proposed Team`, `Critical Path`, `Reasoning Allocation`, `Collaboration Protocol`, `Lane Safety`, and `Approval Gate`.
- Include `Execution Summary` only when approval is already explicit.
