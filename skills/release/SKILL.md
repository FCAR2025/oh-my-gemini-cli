---
name: release
description: Release lifecycle assistant — analyze release rules once, cache, then guide a release with proof at each gate.
---
Run OmG `release`.

Input:
$ARGUMENTS

Argument shapes:
- `<empty>` -> ask the operator for `version` (`patch | minor | major | <explicit semver>`).
- `patch | minor | major | <semver>` -> use as the target version.
- `--refresh` -> re-derive release rules even if a cached file exists.

Step 0 — load or build release rules:
1. Look for `.omg/RELEASE_RULE.md`.
2. If missing OR `--refresh`: run the full repo analysis (Step 1) and write the file with a `last-analyzed:<iso>` marker.
3. If present: scan `.github/workflows/`, `.circleci/`, `.travis.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `gitlab-ci.yml` for files modified after `last-analyzed`. Re-run only those sections; report what changed.

Step 1 — repo analysis (first run or `--refresh`):
- **Version sources**: list every file containing the current version string and how to update it (regex / field). Detect any release script (`scripts/release.*`, `Makefile release`, `bump2version`, `release-it`, `semantic-release`, `changesets`, `goreleaser`).
- **Distribution**: npm, PyPI, Cargo, Docker, GitHub Packages, other. Identify CI publish step + workflow file + job name.
- **Trigger**: tag push (`v*`), `workflow_dispatch`, merge to main/master, release branch merge, conventional commit subject pattern.
- **Test gate**: required test command + CI job + bypass flags (note them but do NOT recommend bypass).
- **Changelog**: presence + convention (Keep a Changelog, Conventional Commits, GitHub auto, none) + release-body file.
- **Tagging**: lightweight vs annotated, signing, prefix (`v`?).
- **Post-release hooks**: announcement, doc rebuild, downstream bumps.
- Write all answers to `.omg/RELEASE_RULE.md` and timestamp it.

Step 2 — execute the release using cached rules:
1. Confirm the target version against version sources; refuse if any source is out of sync without a deliberate decision.
2. Run the test gate; require pass before proceeding. Surface bypass flags as info-only.
3. Update version files + changelog/release-body per repo convention.
4. Stage and commit with the project's release-commit pattern (e.g., `release: vX.Y.Z`).
5. Tag per repo convention (annotated unless rules say otherwise; signing if rule says so).
6. Trigger the publish path (push tag / dispatch / merge); do NOT bypass CI.
7. Watch the publish job until pass/fail; do not claim release is done until artifact lands in the registry.
8. Post-release: open changelog/announcement issue/PR per rules.

State / safety:
1. Read `.omg/state/session-lock.json` before mutating release-time state. Owners write `.omg/state/release.md`; non-owners write `.omg/state/sessions/[session-slug]/release.md`.
2. Stop the release the moment a destructive, credential-sensitive, or policy-blocked step appears; surface what was blocked and why.
3. Never delete tags or force-push unless the operator explicitly approved that exact action AND it is a pre-publish (unreleased) tag.

Response:
## Release Posture
- target version:
- rules cached: yes (last-analyzed: <iso>) | rebuilt
- gate status: tests <ok|fail|blocked>, version sync <ok|drift>, changelog <ok|missing>

## Plan
| Step | Action | Risk | Rollback |
| --- | --- | --- | --- |

## Verdict
- ready / blocked / partial

## Recommended Next Command
- ...
