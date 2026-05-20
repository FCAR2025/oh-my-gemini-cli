---
name = "ultragoal"
description = "Durable multi-goal workflow that persists plan/ledger artifacts under .omg/ultragoal and coordinates the active OmG session across stories"
---

<Purpose>
Ultragoal breaks a brief into an ordered set of goals, records start/checkpoint/blocker/failure events in a durable append-only ledger, and tells the active OmG agent how to drive execution alongside the plan. It does not — and cannot — mutate session state from the shell; it persists durable repo state and prints a model-facing handoff that the active agent must act on in-session.
</Purpose>

<Use_When>
- The user wants a durable, repo-native way to track an ultragoal across multiple OmG sessions or worktrees
- The work is large enough to warrant multiple ordered "stories" with attempt counts and per-story evidence
- The user wants the final completion gated behind ai-slop-cleaner + verification + review
- The user wants the active OmG session directive coordinated with the ledger so that a session restart does not lose progress
</Use_When>

<Do_Not_Use_When>
- The task is a single small change — use direct delegation or the `ultrawork` skill instead
- The user wants a planning-only artifact with no execution loop — use the `plan` skill instead
</Do_Not_Use_When>

<Why_This_Exists>
Long multi-step initiatives lose state across sessions and do not by themselves enforce a final review gate. The ultragoal skill adds a durable plan, ledger, and gating layer so a long initiative can survive session restarts, fresh worktrees, and review iterations while still keeping the active agent focused on the current story.
</Why_This_Exists>

<Artifacts>
All ultragoal artifacts are written to `.omg/ultragoal/`:

- `.omg/ultragoal/brief.md` — the original brief or goal description
- `.omg/ultragoal/goals.json` — ordered list of stories with status, attempt count, and goal IDs
- `.omg/ultragoal/ledger.jsonl` — append-only event log (start / checkpoint / blocker / failure per story)

Before writing, check `.omg/state/session-lock.json` to confirm no other writer holds the lock. The `.omg/state/taskboard.md` single-writer board tracks in-flight tasks during execution.
</Artifacts>

<How_To_Use>

1. Create a plan from a brief:
   ```
   omg ultragoal create-goals --brief-file plan.md
   ```
   Or with explicit stories:
   ```
   omg ultragoal create-goals --brief "ship the migration" \
     --goal "Schema::Add new columns" \
     --goal "Backfill::Backfill rows in batches" \
     --goal "Cutover::Drop old columns and switch reads"
   ```
   The default mode is `aggregate` (one session directive covers the run).
   Pass `--goal-mode per-story` if you want each story to have its own directive.

2. Start (or resume) the next story:
   ```
   omg ultragoal complete-goals
   ```
   This prints a model-facing handoff. The active OmG agent must read it and:
   - Confirm the active session goal condition.
   - Work the story.
   - When the story is complete (and for the final story, after the full quality gate), share back a snapshot of the active goal state and call `checkpoint`.

3. Checkpoint a story:
   ```
   omg ultragoal checkpoint --goal-id G001-... --status complete \
     --evidence "tests/files/PR evidence"
   ```
   For the final story, also pass `--quality-gate-json` containing
   `aiSlopCleaner`, `verification`, and `codeReview` evidence (all clean).

4. If the final review is not clean, do NOT mark complete. Record blockers:
   ```
   omg ultragoal record-review-blockers --goal-id G00X-... \
     --title "Resolve final code-review blockers" \
     --objective "Fix the listed review findings and rerun final gates" \
     --evidence "<the review findings>"
   ```
   This appends a new blocker story and keeps the active session goal running.

5. Inspect state at any time:
   ```
   omg ultragoal status
   ```

</How_To_Use>

<Important_Limitations>
- The shell cannot mutate OmG session goal state. The ultragoal skill only persists durable artifacts and prints instructions that the active OmG agent reads and acts on in-session.
- If the session goal mechanism is renamed or restructured, only the handoff wording needs to change; the reconciliation logic is name-agnostic.
</Important_Limitations>
