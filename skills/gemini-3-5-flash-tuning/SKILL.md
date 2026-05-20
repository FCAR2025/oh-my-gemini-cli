---
name = "gemini-3-5-flash-tuning"
description = "Use when the user invokes Gemini 3.5 Flash or asks how to tune thinking/cost/function-calling/structured-output for the new Gemini 3.5 Flash model. Covers thinkingLevel vs thinkingBudget, VALIDATED function-call mode, code-execution+image, and the no-Live-API constraint."
---

# Gemini 3.5 Flash Tuning

Concrete tuning advice for `gemini-3.5-flash` (canonical) / `gemini-3-5-flash` (hyphen alias), launched at I/O 2026 (2026-05-19). The OmG `before-model-banner.js` hook routes both slugs and auto-translates the thinking-config schema; this skill covers the operator-side knobs.

## Model Identity

- Canonical slug: `gemini-3.5-flash`. Hyphen alias `gemini-3-5-flash` also routes.
- 1M-token input window, 64K-token output window, multimodal in + text out.
- Cost tier `$$` (banner annotation). Roughly 5x the per-token cost of 2.5 Flash; route only when 3.x reasoning or new capabilities are required.
- No Live API support — pin Live sessions to a model that supports the Live surface.

## Default vs Override Knobs

| Knob | Field path | Default | When to override |
|------|-----------|---------|------------------|
| Thinking depth | `generationConfig.thinkingConfig.thinkingLevel` | `medium` | `high` for architecture, adversarial review, deep reasoning; `low`/`minimal` for cheap quick checks (cuts spend at the cost of reasoning quality) |
| Temperature | `generationConfig.temperature` | `1.0` | Do NOT lower below 1.0 (docs); the hook clamps lower values back to 1.0 |
| Function calling | `toolConfig.functionCallingConfig.mode` | `AUTO` | `VALIDATED` when the response must be either a function call or natural language with schema enforcement; `ANY` to force a call; `NONE` to disable |
| Structured output | `generationConfig.responseSchema` + `responseMimeType: application/json` | unset | Set when the caller needs guaranteed-shape JSON; pair with `VALIDATED` for strongest correctness |

## When to Escalate `thinkingLevel`

- `minimal` / `low`: throwaway smoke tests, single-file edits, "is this null" sanity checks.
- `medium` (default): standard execution-lane work, code review, doc generation.
- `high`: deep refactor planning, architectural critique, ambiguity resolution, contested-tradeoff analysis.

`high` consumes substantially more thinking tokens; do not set it as a default. Set it per-request when the task signals it.

## VALIDATED Function-Call Mode

`VALIDATED` (new in 3.5 Flash; joins `AUTO`/`ANY`/`NONE`) constrains the response to either:
- a function call whose arguments match the schema, OR
- a natural-language reply.

Use it when:
- The caller is a downstream agent that branches on tool-call vs prose.
- You want schema enforcement on tool arguments without forcing a call (which `ANY` does).
- You are wiring 3.5 Flash into an MCP / function-calling pipeline that must not mis-call a tool.

Avoid `VALIDATED` for free-form exploration; use `AUTO` instead.

## Cost Trade-off

3.5 Flash is `$1.50` per 1M input / `$9.00` per 1M output tokens — about 5x 2.5 Flash. Heuristic:

- Standard execution lane → stay on 2.5 Flash unless the task needs 3.x reasoning or the new code-execution+image surface.
- Planning lane → use Pro (`$$$`) for the heaviest reasoning; use 3.5 Flash (`$$`) when Pro is overkill but 2.5 Flash is not enough.
- Quick lane → stay on 2.5 Flash-Lite or 2.5 Flash; 3.5 Flash here just leaks cost.

## Code Execution + Image (new in 3.5 Flash)

3.5 Flash supports image-aware code execution: visual math, zoom-into-image, image annotation in the same turn as `code_execution`. This is a genuinely new capability; route to 3.5 Flash when the task mixes image input with computation.

Older Flash variants will refuse or degrade on these requests; do not silently route image+code workflows to 2.5 Flash.

## Live API Exclusion (hard)

`gemini-3.5-flash` does NOT support the Live API. If the operator request involves Live streaming, voice, or `bidiGenerateContent`, route to a Live-capable model — never to 3.5 Flash. The OmG proxy boundary in `context/omg-core.md` already treats Live as a separate surface; respect that.

## Verifying the Routed Config

After the request leaves OmG, the `before-model-banner.js` hook emits a `systemMessage` banner of the form:

```
OmG model route: gemini-3.5-flash $$ | <translation warnings, if any>
```

If you sent a `thinkingBudget` (2.5-shaped) request and the hook routed to 3.5 Flash, the banner will note the field was dropped and `thinkingLevel=medium` was set. If you sent a `thinkingLevel` (3.x-shaped) request that landed on 2.5 Flash, the banner will note the translation to an integer budget.

## See Also

- `context/omg-core.md` — "Gemini 3.5 Flash routing" canonical reference.
- `hooks/scripts/before-model-banner.js` — the schema translator.
- `/omg:capabilities` — capability/model routing helper.
