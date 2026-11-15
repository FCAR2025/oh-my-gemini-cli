---
name: "hud-compact"
description: "Quick toggle: set OmG HUD visibility profile to compact."
---
Set OmG HUD visibility profile to `compact`.

Protocol:
1. Apply `visibility = compact`.
2. Read `.omg/state/session-lock.json` before mutating shared HUD state.
3. If filesystem tools are available:
   - if the current orchestration session owns the lock, write/update `.omg/state/hud.json` with source `omg:hud-compact`
   - otherwise write `.omg/state/sessions/[session-slug]/hud.json` with source `omg:hud-compact` and report the ownership conflict
4. Provide one-line compact HUD preview and recommended follow-up command.

Output format:
## HUD
- applied: compact
- persisted:

## Preview
```text
[OMG][MODEL gemini-4-carbon-high/gemini-4-argon-high/gemini-4-hydrogen-high g4:on][STAGE team-exec][TASKS 3/8][NEXT /omg:team-verify]
```

## Next Command
- /omg:status
