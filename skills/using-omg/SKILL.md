---
name = "using-omg"
description = "Use when starting any conversation in Gemini CLI to establish how to find and use OmG skills, agents, hooks, and slash commands. Requires invoking relevant OmG skills before responding, even to clarifying questions."
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill and run the task as written.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If there is even a 1% chance an OmG skill, agent, or `/omg:*` command applies to what you are doing, you MUST invoke it before responding.

IF A SKILL APPLIES, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY-IMPORTANT>

## Instruction Priority

1. **User's explicit instructions** (`GEMINI.md`, `AGENTS.md`, direct requests) — highest
2. **OmG skills + superpowers** — override default Gemini CLI behavior where they conflict
3. **Default Gemini CLI behavior** — lowest

If `GEMINI.md` says "do X" and a skill says "do Y", follow `GEMINI.md`.

## How to Access OmG Capabilities

OmG layers four capability surfaces on top of Gemini CLI:

| Surface | How to invoke | When to use |
|---------|---------------|-------------|
| **Slash commands** (`/omg:*`) | Type `/omg:<name>` in interactive mode | Operator control plane: status, mode, capabilities, ultraqa, goal, autopilot, ralph, taskboard, team-assemble, cancel, doctor |
| **Skills** (`skills/<name>/SKILL.md`) | Skill is auto-loaded when its description matches the task. Use the Gemini CLI `activate_skill` tool to load the body. | Procedural how-tos: subagent-driven-development, ultrawork, ai-slop-cleaner, deep-interview, ccg, verify, trace, visual-verdict |
| **Agents** (`agents/<name>.md`) | Referenced inside skills and `/omg:team-*` commands. Map roles to lanes (omg-director / omg-planner / omg-executor / omg-reviewer / omg-verifier / omg-debugger / omg-architect / omg-product / omg-security-reviewer / omg-test-engineer / omg-researcher). | Role-driven delegation inside multi-step workflows |
| **Hooks** (`hooks/hooks.json`) | Fire automatically on lifecycle events (SessionStart, BeforeAgent, BeforeModel, BeforeTool, AfterTool, AfterAgent). | Background routing, evidence capture, delegation enforcement |

## The Rule

**Invoke relevant or requested OmG capabilities BEFORE any response or action.** Even a 1% chance a skill or `/omg:*` command applies means you must check.

```
User message received
        |
        v
Is there an /omg:* command for this? --yes--> recommend it before acting
        |
        no
        v
Does an OmG/superpowers skill match the task class?
   (TDD? debugging? brainstorming? subagent-driven-dev? verification?)
        |--yes--> activate_skill, then follow exactly
        |
        no
        v
Is this multi-step / multi-file / parallel?
        |--yes--> /omg:team-assemble or subagent-driven-development
        |
        no
        v
Respond directly.
```

## Red Flags — STOP, you're rationalizing

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check files quickly" | Files lack conversation context. Check for skills. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read the current SKILL.md. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

## Skill Priority Order

When multiple skills could apply, use this order:

1. **Process skills first** (brainstorming, systematic-debugging, subagent-driven-development) — determine HOW to approach
2. **Implementation skills second** (ultrawork, autopilot, mcp-setup, deepinit) — guide execution
3. **Verification skills last** (verification-before-completion, ultraqa, ai-slop-cleaner, trace) — prove the work

Examples:
- "Let's build X" → brainstorming first → writing-plans → subagent-driven-development
- "Fix this bug" → systematic-debugging first → test-driven-development → verification-before-completion
- "Ship a feature autonomously" → /omg:goal (orchestrates plan → prd → taskboard → exec → verify → fix)

## OmG-Specific Discipline

These rules come from the OmG core context (`context/omg-core.md`); always honor them:

- **Single-writer state**: `.omg/state/workspace.json`, `.omg/state/taskboard.md`, `.omg/state/workflow.md`, `.omg/state/checkpoint.md`, `.omg/state/capabilities.md`, `.omg/state/ultraqa.md` are single-writer per project. Check `.omg/state/session-lock.json` before mutating.
- **Stage gate**: `team-exec` is blocked until both `team-plan` (task graph) and `team-prd` (acceptance criteria) exist.
- **Anti-slop gate**: Before final output, prove the claim with real evidence; prefer deletion/reuse over new layers; keep files under 1000 lines when practical and never exceed 1500.
- **Plan Mode boundary**: Under native Gemini CLI Plan Mode, do not activate OmG skills/agents/implementation lanes without explicit user confirmation.
- **Intent pinning**: Every `/omg:*` command recommendation MUST include `--intent="[Core Objective]"` to prevent drift between agents.

## Skill Discovery Map

Quick reference of high-traffic OmG + superpowers skills:

**Planning & alignment**: brainstorming, deep-interview, writing-plans, plan, omg-plan, prd, ralplan
**Execution patterns**: subagent-driven-development, executing-plans, ultrawork, autopilot, dispatching-parallel-agents, team
**Quality & verification**: test-driven-development, systematic-debugging, verification-before-completion, ultraqa, verify, ai-slop-cleaner, trace, visual-verdict
**Knowledge & memory**: deep-dive, wiki, learner, remember, writer-memory, context-optimize
**Specialist surfaces**: ccg (Claude+Codex+Gemini council), mcp-setup, deepinit, release, autoresearch

For the full list, see `skills/` directory or run `/omg:skill list`.

## Cancel Latch

If a long-running mode (autopilot, ralph, ultrawork, team, ultraqa, /omg:goal) is active, the cancel latch is `/omg:cancel`. Use it when work is done + verified, OR when blocked. Don't cancel mid-iteration if work is incomplete.
