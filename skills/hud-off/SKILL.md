---
name: hud-off
description: Quick toggle: set OmG HUD visibility profile to hidden.
---
Set OmG HUD visibility profile to `hidden`.

Protocol:
1. Apply `visibility = hidden`.
2. Read `.omg/state/session-lock.json` before mutating shared HUD state.
3. If filesystem tools are available:
   - if the current orchestration session owns the lock, write/update `.omg/state/hud.json` with source `omg:hud-off`
   - otherwise write `.omg/state/sessions/[session-slug]/hud.json` with source `omg:hud-off` and report the ownership conflict
4. Confirm that future `/omg:status` calls should avoid visual HUD code blocks.

Output format:
## HUD
- applied: hidden
- persisted:

## Effect
- `/omg:status` should return plain sections without HUD code block.

## Next Command
- /omg:status
