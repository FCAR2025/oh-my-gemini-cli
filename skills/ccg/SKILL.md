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

2. Gemini invokes the `/omg:ask` slash command twice:
   - /omg:ask claude "<claude prompt>"
   - /omg:ask codex "<codex prompt>"

3. Each `/omg:ask` call writes an artifact under .omg/state/ask/

4. Gemini reads both artifacts and synthesizes one final response
```

## Execution Protocol

When invoked, Gemini MUST follow this workflow:

### 1. Decompose Request

Split the user request into:

- **Claude prompt:** architecture, correctness, backend, risks, test strategy
- **Codex prompt:** UX/content clarity, alternatives, edge-case usability, docs polish
- **Synthesis plan:** how to reconcile conflicts

### 2. Invoke advisors via `/omg:ask`

`/omg:ask` is a real Gemini slash command (see `commands/omg/ask.toml`) that wraps the cross-runtime advisor surface. Issue it as the next operator command — it is not a shell call and is not skill nesting:

```
/omg:ask claude "<claude prompt>"
/omg:ask codex "<codex prompt>"
```

### 3. Collect artifacts

Read latest ask artifacts from:

```text
.omg/state/ask/claude-*.md
.omg/state/ask/codex-*.md
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

There is no `/omg:ccg` slash command. Activate this skill via its frontmatter trigger — phrases such as "ccg", "council", "claude+codex+gemini", or "tri-model" auto-load `ccg` per the keyword-detector rule in `hooks/scripts/before-agent-keywords.js`.

Example operator phrasing:

> "Run ccg on this PR — architecture and security via Claude, UX and readability via Codex."

The skill then issues the two `/omg:ask` commands described above and synthesizes the results.
