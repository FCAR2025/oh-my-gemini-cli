---
name: project-session-manager
description: Worktree-first dev environment manager for issues, PRs, and features (with optional tmux session).
---
Run OmG `project-session-manager` (also `/omg:psm`).

Input:
$ARGUMENTS

Subcommands (first token of `$ARGUMENTS`):
- `start <ref>` -> create or resume a session for the ref. `<ref>` accepts:
  - `#NN` (GitHub issue number; needs `gh` CLI configured)
  - `pr/NN` (open PR by number)
  - `feature/<slug>` (feature branch by name)
- `list` -> show active sessions: branch, worktree path, last commit, status, optional tmux session id
- `resume <slug>` -> attach to an existing session by slug (re-enters the worktree, optionally re-attaches tmux)
- `finish <slug> [--push] [--pr]` -> persist session notes, optionally push branch / open PR, then mark session done
- `stop <slug>` -> archive without finishing (worktree retained; session marked stopped)

Worktree discipline:
1. Each session gets its own git worktree under `.omg/worktrees/<slug>/`. Never cross-contaminate one session's branch with another's worktree.
2. Refuse to start a session whose target branch already has an active worktree; ask the operator to `resume` instead.
3. `finish --push` must verify the test gate of the project before pushing; refuse to push on a red gate without an explicit `--force-push` flag.

Tmux integration (optional):
- When `tmux` is available and `OMG_PSM_USE_TMUX=1`, also create/attach a tmux session named `omg-<slug>`.
- Default windows: `editor`, `repl`, `tests`. Operators can customize via `.omg/rules/psm.json`.
- If tmux is not available, surface session status as plain text.

State persistence:
- Session metadata at `.omg/state/psm/<slug>.json` with fields: `slug`, `ref`, `branch`, `worktree_path`, `created_at`, `last_active_at`, `status: active | stopped | finished`, `tmux_session?`, `pr_url?`.
- Notes per session at `.omg/state/psm/<slug>/notes.md` (append-only chronicle).
- Read `.omg/state/session-lock.json` before mutating PSM state. Non-owners write to `.omg/state/sessions/[session-slug]/psm/`.

Anti-slop guards:
- Never delete a worktree with uncommitted changes; archive notes and surface the dirty state.
- Never auto-merge a PR; operators merge via `gh pr merge` themselves.
- Never re-use a session slug for a different ref; collisions stop the operation with the conflicting metadata path.

Response:
## PSM Operation
- subcommand:
- target:

## Session State
| Slug | Ref | Branch | Worktree | Status | tmux | Last Active |
| --- | --- | --- | --- | --- | --- | --- |

## Result
- ...

## Recommended Next Command
- ...
