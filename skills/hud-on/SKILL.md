---
name: hud-on
description: Quick toggle: set OmG HUD visibility profile to normal.
---
Set OmG HUD visibility profile to `normal`.

Protocol:
1. Apply `visibility = normal`.
2. Read `.omg/state/session-lock.json` before mutating shared HUD state.
3. If filesystem tools are available:
   - if the current orchestration session owns the lock, write/update `.omg/state/hud.json` with source `omg:hud-on`
   - otherwise write `.omg/state/sessions/[session-slug]/hud.json` with source `omg:hud-on` and report the ownership conflict
4. Provide one-line HUD preview and recommended follow-up command.

Output format:
## HUD
- applied: normal
- persisted:

## Preview
```text
[OMG][MODEL balanced gemini-3.1-pro-preview/gemini-3-flash-preview/gemini-3.1-flash-lite-preview preview:on][MODE balanced][STAGE team-exec][TASKS 3/8][RISKS 1][NEXT /omg:team-verify]
```

## Next Command
- /omg:status
