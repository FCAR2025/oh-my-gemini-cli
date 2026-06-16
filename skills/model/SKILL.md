---
name: model
description: Inspect or set OmG model-selection strategy (balanced, auto, custom) for Gemini-native task routing.
---
Run OmG model-strategy manager.

Input:
$ARGUMENTS

Protocol:
1. Parse requested strategy and optional lane overrides.
   - examples:
     - `auto`
     - `balanced`
     - `custom planning=gemini-3.1-pro-preview execution=gemini-3-flash-preview quick=gemini-3.1-flash-lite-preview review_verify=gemini-3.1-pro-preview tools=gemini-3.1-pro-preview-custom-tools`
2. Supported strategies:
   - `balanced` (default): role-aware lane split (`gemini-3.1-pro-preview` for planning/review, `gemini-3-flash-preview` for execution, `gemini-3.1-flash-lite-preview` for quick low-risk edits)
   - `auto`: defer lane model selection to Gemini runtime auto-model policy across all lanes
   - `custom`: operator-provided lane map with concrete model names or Gemini CLI aliases
3. If no strategy is provided, show current policy from `.omg/state/model.json` when available.
4. Produce an effective lane map for:
   - planning
   - execution
   - quick_edit
   - review_verify
   - tool_calling
   - multimodal_review
   - external_research
5. If filesystem tools are available, write/update `.omg/state/model.json` using session-lock discipline.
6. Clarify boundaries:
   - this command sets OmG orchestration defaults
   - runtime model forcing still depends on Gemini CLI runtime controls (for example `/model` or launch-time `--model` when supported)
   - separate Gemini API surfaces (Live, Files, Batch/cache, embeddings, media generation, TTS, Veo, Imagen, Lyria) require runtime/API support beyond normal chat-completions-style proxying

Suggested `model.json` shape:
{
  "strategy": "balanced|auto|custom",
  "lane_models": {
    "planning": "gemini-3.1-pro-preview|auto|<custom>",
    "execution": "gemini-3-flash-preview|auto|<custom>",
    "quick_edit": "gemini-3.1-flash-lite-preview|auto|<custom>",
    "review_verify": "gemini-3.1-pro-preview|auto|<custom>",
    "tool_calling": "gemini-3.1-pro-preview-custom-tools|auto|<custom>",
    "multimodal_review": "gemini-3.1-pro-preview|auto|<custom>",
    "external_research": "gemini-3.1-pro-preview|auto|<custom>"
  },
  "updated_at": "<ISO-8601>",
  "source": "omg:model"
}

Response:
- Keep it concise and operator-facing.
- Include `Model Strategy`, `Effective Allocation`, `Runtime Notes`, and `Next Command`.
