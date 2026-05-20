---
name = "ccg"
description = "Claude-Codex-Gemini tri-model orchestration via /omg:ask, with Gemini synthesizing results from external advisors"
---

# CCG - Claude-Codex-Gemini Tri-Model Orchestration

CCG routes through the canonical `/omg:ask` skill (`/omg:ask claude` + `/omg:ask codex`), then Gemini synthesizes both outputs into one answer. In the OmG context, Gemini is the local-process model; external advisors are Claude and Codex.

Use this when you want parallel external perspectives without launching full team workers.

## When to Use

- Backend/analysis + frontend/UI work in one request
- Code review from multiple perspectives (architecture + design/UX)
- Cross-validation where Claude and Codex may disagree
- Fast advisor-style parallel input without team runtime orchestration

## Requirements

- **Codex CLI**: `npm install -g @openai/codex`
- **Claude CLI** (or `ag-claude` proxy): available in PATH
- `/omg:ask` command available at `commands/omg/ask.toml`
- If either CLI is unavailable, continue with whichever provider is available and note the limitation

## How It Works

```text
1. Gemini decomposes the request into two advisor prompts:
   - Claude prompt (analysis/architecture/backend)
   - Codex prompt (UX/design/docs/alternatives)

2. Gemini runs via CLI (skill nesting not supported):
   - /omg:ask claude "<claude prompt>"
   - /omg:ask codex "<codex prompt>"

3. Artifacts are written under .omg/artifacts/ask/

4. Gemini synthesizes both outputs into one final response
```

## Execution Protocol

When invoked, Gemini MUST follow this workflow:

### 1. Decompose Request

Split the user request into:

- **Claude prompt:** architecture, correctness, backend, risks, test strategy
- **Codex prompt:** UX/content clarity, alternatives, edge-case usability, docs polish
- **Synthesis plan:** how to reconcile conflicts

### 2. Invoke advisors via CLI

> **Note:** Skill nesting (invoking a skill from within an active skill) is not supported in Gemini CLI. Always use the direct CLI path via `run_shell_command`.

Run both advisors:

```bash
/omg:ask claude "<claude prompt>"
/omg:ask codex "<codex prompt>"
```

### 3. Collect artifacts

Read latest ask artifacts from:

```text
.omg/artifacts/ask/claude-*.md
.omg/artifacts/ask/codex-*.md
```

Use `read_file` to load each artifact.

### 4. Synthesize

Return one unified answer with:

- Agreed recommendations
- Conflicting recommendations (explicitly called out)
- Chosen final direction + rationale
- Action checklist

## Fallbacks

If one provider is unavailable:

- Continue with available provider + Gemini synthesis
- Clearly note missing perspective and risk

If both unavailable:

- Fall back to Gemini-only answer and state CCG external advisors were unavailable

## Invocation

```bash
/omg:ccg <task description>
```

Example:

```bash
/omg:ccg Review this PR - architecture/security via Claude and UX/readability via Codex
```
