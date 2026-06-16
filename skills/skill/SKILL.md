---
name: skill
description: Manage local OmG skills — list, add, remove, search, edit.
---
Run OmG `skill` manager.

Input:
$ARGUMENTS

Subcommands (first token of `$ARGUMENTS`):
- `list` -> Inspect bundled skills under `skills/` plus learned/project skills under `.omg/skills/` (and `${HOME}/.gemini/extensions/oh-my-gemini-cli/skills/` when running inside an isolated Gemini home). Print a table grouped by scope: `built-in`, `project`, `user`. For each: name, description, triggers, scope.
- `search <terms>` -> Match `<terms>` against skill `name`, `description`, and `triggers` across all scopes. Rank by exact-trigger match > description term match > name fragment match.
- `show <name>` -> Read the matching `SKILL.md` and surface frontmatter + sections. Refuse to expand bundled built-in skills beyond their public docs.
- `add <name>` -> Wizard for a new project skill at `.omg/skills/<name>/SKILL.md`. Required fields: `name`, `description` (one-liner), `triggers` (comma-separated). Optional: `argument-hint`, `agent`. Validate `<name>` is `[a-z][a-z0-9-]*`.
- `edit <name>` -> Open the matching skill file path. Refuse to edit `built-in` scope; redirect to `add` (project copy) or upstream PR.
- `remove <name>` -> Ask once for confirmation, then delete `.omg/skills/<name>/`. Refuse to remove `built-in` scope.

Discovery contract:
- Built-in skills are read-only and shipped with this OmG install. Do NOT modify them via `edit` or `remove`; they belong to the extension's source-of-truth.
- Project skills (`.omg/skills/`) and learned skills (`.omg/skills/learned/`) are operator-owned and freely editable.

State / safety:
1. Read `.omg/state/session-lock.json` before mutating skill files.
2. Refuse to write skill metadata that fails `scripts/check-skill-metadata.js`; run that check after every `add` and `edit`.
3. Never embed secrets in skill bodies. If detected, refuse and surface the path.

Response:
## Skill Operation
- subcommand:
- scope counts: built-in=N project=M user=K

## Result
| Skill | Scope | Triggers | Notes |
| --- | --- | --- | --- |

## Recommended Next Command
- ...
