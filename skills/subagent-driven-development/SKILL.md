---
name = "subagent-driven-development"
description = "Use when executing an OmG implementation plan with independent tasks in the current session. Dispatches a fresh sub-agent per task with a two-stage review (spec compliance, then code quality) before marking each task complete."
---

# Subagent-Driven Development (OmG)

Execute a plan by dispatching a fresh OmG sub-agent per task, with two-stage review after each: spec-compliance review first, then code-quality review.

**Why sub-agents:** You delegate each task to a specialized OmG agent with isolated context. By crafting their instructions precisely, you keep them focused. They should never inherit your session history — you construct exactly what they need. This also preserves your own context for coordination work.

**Core principle:** Fresh sub-agent per task + two-stage review (spec → quality) = high quality, fast iteration.

**Continuous execution:** Do not pause to check in with the human between tasks. Execute every task in the plan without stopping. The only legitimate stops are: unresolvable BLOCKED status, ambiguity that genuinely prevents progress, or all tasks complete. "Should I continue?" prompts and progress summaries waste time — the operator asked you to execute the plan, so execute it.

## When to Use

Pre-conditions:
- An OmG plan exists (from `/omg:team-plan`, `writing-plans`, `omg-plan`, or operator-provided spec)
- Tasks are mostly independent (no tight coupling that forces sequential coordination)
- You will stay in this Gemini CLI session (otherwise use `executing-plans`)

If any pre-condition fails, fall back to:
- `brainstorming` (from superpowers) then `writing-plans` (from superpowers) (no plan yet)
- `executing-plans` (from superpowers) (parallel session instead of same-session)
- Manual single-pass execution (1-2 trivial tasks, no benefit from delegation)

## OmG Agent Registry → Role Mapping

Use this table when you dispatch each sub-agent. Names match `agents/<name>.md`.

| Stage | OmG agent | Model tier | Prompt template |
|-------|-----------|------------|-----------------|
| Implementer | `omg-executor` | execution-lane (gemini-3-flash-preview) default → planning-lane (gemini-3.1-pro-preview) if integration-heavy | `./implementer-prompt.md` |
| Spec-compliance reviewer | `omg-reviewer` | execution-lane (gemini-3-flash-preview) | `./spec-reviewer-prompt.md` |
| Code-quality reviewer | `omg-verifier` | planning-lane (gemini-3.1-pro-preview) | `./code-quality-reviewer-prompt.md` |
| Final whole-implementation reviewer | `omg-verifier` | planning-lane (gemini-3.1-pro-preview) | `./code-quality-reviewer-prompt.md` (scope = full diff) |

Optional specialists when the task class warrants:
- `omg-debugger` — task is "why is X broken"
- `omg-security-reviewer` — task touches auth, secrets, trust boundaries
- `omg-test-engineer` — task is test-strategy heavy
- `omg-architect` — task forces a design decision the plan did not pin

## The Process

```
1. Read plan once. Extract every task with full text + scene-setting context.
2. Persist tasks to .omg/state/taskboard.md (single-writer per project).
3. For each task in dependency-safe order:
   a. Dispatch implementer (omg-executor) with full task text + context + acceptance criteria
   b. If implementer asks questions → answer → re-dispatch
   c. Implementer reports DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
   d. If DONE / DONE_WITH_CONCERNS resolved → dispatch spec-reviewer (omg-reviewer)
   e. If spec-reviewer ❌ → implementer fixes → re-dispatch spec-reviewer
   f. When spec-reviewer ✅ → dispatch code-quality-reviewer (omg-verifier)
   g. If code-quality-reviewer ❌ → implementer fixes → re-dispatch code-quality-reviewer
   h. When code-quality-reviewer ✅ → mark task complete in .omg/state/taskboard.md
4. After all tasks → dispatch final code-quality-reviewer for entire branch diff.
5. Hand off via `finishing-a-development-branch` (from superpowers) skill.
```

## Model Selection (OmG / Gemini lane mapping)

Use the cheapest model that can plausibly succeed at each role.

| Task signal | Model |
|-------------|-------|
| 1-2 files, complete spec, mechanical edit | `gemini-3.1-flash-lite-preview` (quick lane) |
| Multi-file integration, pattern matching | `gemini-3-flash-preview` (execution lane) |
| Architecture / design / cross-system review | `gemini-3.1-pro-preview` (planning + review lane) |
| Tool-heavy autonomous loop | execution-lane (gemini-3-flash-preview) or planning-lane (gemini-3.1-pro-preview) custom-tools variant |

Re-dispatch with a higher tier ONLY when the implementer reports BLOCKED due to reasoning ceiling. Do not pre-pessimize.

## Handling Implementer Status

| Status | Action |
|--------|--------|
| `DONE` | Proceed to spec-compliance review |
| `DONE_WITH_CONCERNS` | Read concerns. If correctness/scope, fix BEFORE review. If observations ("file getting large"), note in taskboard and proceed to review. |
| `NEEDS_CONTEXT` | Provide missing context, re-dispatch. Never let the implementer guess. |
| `BLOCKED` | Diagnose: context problem → add context; reasoning ceiling → upgrade tier; task too large → split; plan is wrong → escalate to operator. |

**Never** ignore an escalation. **Never** retry the same model with the same prompt and expect different output.

## Prompt Templates

- `./implementer-prompt.md` — Dispatch the omg-executor sub-agent.
- `./spec-reviewer-prompt.md` — Dispatch the omg-reviewer sub-agent for spec compliance.
- `./code-quality-reviewer-prompt.md` — Dispatch the omg-verifier sub-agent for code quality.

## Quality Gates (do not skip)

1. **Implementer self-review** — happens before status report.
2. **Spec-compliance review** — confirms code matches the plan (nothing missing, nothing extra).
3. **Code-quality review** — confirms the implementation is well-built (clarity, tests, naming, complexity).
4. **Final whole-diff review** — confirms the entire branch is coherent before handoff.

**Order matters.** Code-quality before spec-compliance is wrong order — fix scope first, polish second.

## Red Flags

**Never:**
- Start implementation on `main`/`master` without explicit operator consent
- Dispatch multiple implementer sub-agents in parallel against the same lane (conflicts)
- Make the implementer read the plan file (provide full task text + context inline)
- Skip scene-setting context
- Ignore implementer questions
- Accept "close enough" on spec compliance — reviewer found issues → not done
- Skip a re-review after the implementer claims to have fixed the issues
- Let implementer self-review replace the spec/quality reviewer pass
- Start the code-quality review before spec compliance is ✅
- Move to the next task while either review has open issues

**If a sub-agent fails the task:**
- Dispatch a fix sub-agent with specific instructions
- Do NOT try to fix manually (context pollution defeats the point of the skill)

## OmG-Specific Integration

| Step | OmG capability to invoke |
|------|--------------------------|
| Workspace isolation | `using-git-worktrees` (from superpowers) or `/omg:workspace audit` |
| Plan source | `writing-plans` / `omg-plan` / `/omg:team-plan` / `/omg:team-prd` |
| Sub-agent dispatch surface | OmG agent dispatch / Gemini CLI sub-agent tool — see `agents/` registry |
| Task ledger | `.omg/state/taskboard.md` (single-writer per project; check `.omg/state/session-lock.json` first) |
| Acceptance evidence | `verification-before-completion` skill or `/omg:ultraqa` |
| Hand-off | `finishing-a-development-branch` (from superpowers) |

## Cost / Benefit

**Cost:** more sub-agent calls (implementer + 2 reviewers per task) + controller prep work.
**Benefit:** issues caught in spec-review are cheaper than catching them in CI or production. Fresh context per task prevents the long-context degradation that destroys multi-task sessions.

## Reference

Companion skill in the superpowers extension: `superpowers:subagent-driven-development` — same process, Claude-native agent registry. This OmG version maps to OmG's Gemini-native agents (`omg-executor` / `omg-reviewer` / `omg-verifier`) and OmG state surface (`.omg/state/taskboard.md`).
