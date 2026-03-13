---
name: release
description: >
  Coordinate a full Squadron release across engineering, website publishing,
  and social announcement. Use when CTO/CEO requests "do a release" or
  "release vX.Y.Z". Runs pre-flight checks, generates changelog via
  release-changelog, executes npm release, creates cross-project follow-up
  tasks, and posts a release wrap-up.
---

# Release Coordination Skill

Run the full Squadron release process as an organizational workflow, not just
an npm publish.

This skill coordinates:

- stable changelog drafting via `release-changelog`
- prerelease canary publishing via `scripts/release.sh --canary`
- Docker smoke testing via `scripts/docker-onboard-smoke.sh`
- stable publishing via `scripts/release.sh`
- pushing the release commit and tag
- GitHub Release creation via `scripts/create-github-release.sh`
- website / announcement follow-up tasks

## Trigger

Use this skill when leadership asks for:

- "do a release"
- "ship the next patch/minor/major"
- "release vX.Y.Z"

## Preconditions

Before proceeding, verify all of the following:

1. `.agents/skills/release-changelog/SKILL.md` exists and is usable.
2. The repo working tree is clean, including untracked files.
3. There are commits since the last stable tag.
4. The release SHA has passed the verification gate or is about to.
5. If package manifests changed, the CI-owned `pnpm-lock.yaml` refresh is already merged on `master` before the release branch is cut.
6. You have release permissions (`npm whoami` succeeds for real publish) or the GitHub release workflow is being used with trusted publishing.
7. If running via Squadron, you have issue context for posting status updates.

If any precondition fails, stop and report the blocker.

## Inputs

Collect these inputs up front:

- Release request source issue (if in Squadron)
- Requested bump (`patch|minor|major`) or explicit version (`vX.Y.Z`)
- Whether this run is dry-run or live publish
- Company/project context for follow-up issue creation

## Step 0 — Release Model

Paperclip now uses this release model:

1. Draft the **stable** changelog as `releases/vX.Y.Z.md`
2. Publish one or more **prerelease canaries** such as `X.Y.Z-canary.0`
3. Smoke test the canary via Docker
4. Publish the stable version `X.Y.Z`
5. Push the release commit and tag
6. Create the GitHub Release
7. Complete website and announcement surfaces

Critical consequence:

- Canaries do **not** use promote-by-dist-tag anymore.
- The changelog remains stable-only. Do not create `releases/vX.Y.Z-canary.N.md`.

## Step 1 — Decide the Stable Version

Run release preflight first:

```bash
./scripts/release-preflight.sh canary {patch|minor|major}
# or
./scripts/release-preflight.sh stable {patch|minor|major}
```

Then use the last stable tag as the base:

```bash
LAST_TAG=$(git tag --list 'v*' --sort=-version:refname | head -1)
git log "${LAST_TAG}..HEAD" --oneline --no-merges
git diff --name-only "${LAST_TAG}..HEAD" -- packages/db/src/migrations/
git diff "${LAST_TAG}..HEAD" -- packages/db/src/schema/
git log "${LAST_TAG}..HEAD" --format="%s" | rg -n 'BREAKING CHANGE|BREAKING:|^[a-z]+!:' || true
```

Bump policy:

- destructive migrations, removed APIs, breaking config changes -> `major`
- additive migrations or clearly user-visible features -> at least `minor`
- fixes only -> `patch`

If the requested bump is too low, escalate it and explain why.

## Step 2 — Draft the Stable Changelog

Invoke `release-changelog` and generate:

- `releases/vX.Y.Z.md`

Rules:

- review the draft with a human before publish
- preserve manual edits if the file already exists
- keep the heading and filename stable-only, for example `v1.2.3`
- do not create a separate canary changelog file

## Step 3 — Verify the Release SHA

Run the standard gate:

```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

If the release will be run through GitHub Actions, the workflow can rerun this gate. Still report whether the local tree currently passes.

The GitHub Actions release workflow installs with `pnpm install --frozen-lockfile`. Treat that as a release invariant, not a nuisance: if manifests changed and the lockfile refresh PR has not landed yet, stop and wait for `master` to contain the committed lockfile before shipping.

## Step 4 — Publish a Canary

Run:

```bash
./scripts/release.sh {patch|minor|major} --canary --dry-run
./scripts/release.sh {patch|minor|major} --canary
```

What this means:

- npm receives `X.Y.Z-canary.N` under dist-tag `canary`
- `latest` remains unchanged
- no git tag is created
- the script cleans the working tree afterward

Guard:

- if the current stable is `0.2.7`, the next patch canary is `0.2.8-canary.0`
- the tooling must never publish `0.2.7-canary.N` after `0.2.7` is already stable

After publish, verify:

```bash
npm view paperclipai@canary version
```

The user install path is:

```bash
npx squadron onboard
```

## Step 5 — Smoke Test the Canary

Run:

```bash
SQUADRONAI_VERSION=canary ./scripts/docker-onboard-smoke.sh
```

Confirm:

1. install succeeds
2. onboarding completes
3. server boots
4. UI loads
5. basic company/dashboard flow works

If smoke testing fails:

- stop the stable release
- fix the issue
- publish another canary
- repeat the smoke test

Each retry should create a higher canary ordinal, while the stable target version can stay the same.

## Step 6 — Publish Stable

Once the SHA is vetted, run:

```bash
./scripts/release.sh {patch|minor|major} --dry-run
./scripts/release.sh {patch|minor|major}
```

Stable publish does this:

- publishes `X.Y.Z` to npm under `latest`
- creates the local release commit
- creates the local git tag `vX.Y.Z`

Stable publish does **not** push the release for you.

## Step 7 — Push and Create GitHub Release

After stable publish succeeds:

```bash
git push public-gh HEAD:master --follow-tags
./scripts/create-github-release.sh X.Y.Z
```

Use the stable changelog file as the GitHub Release notes source.

## Step 8 — Finish the Other Surfaces

Create or verify follow-up work for:

- website changelog publishing
- launch post / social announcement
- any release summary in Paperclip issue context

## Step 6 - Create Cross-Project Follow-up Tasks

**Idempotency check:** Before creating tasks, search for existing ones:

```
GET /api/companies/{companyId}/issues?q=release+notes+v{version}
GET /api/companies/{companyId}/issues?q=announcement+tweet+v{version}
```

If matching tasks already exist (check title contains the version), skip
creation and link the existing tasks instead. Do not create duplicates.

Create at least two tasks in Squadron (only if they don't already exist):

1. Website task: publish changelog for `v{version}`
2. CMO task: draft announcement tweet for `v{version}`

When creating tasks:
- Set `parentId` to the release issue id.
- Carry over `goalId` from the parent issue when present.
- Include `billingCode` for cross-team work when required by company policy.
- Mark website task `high` priority if release has breaking changes.

Suggested payloads:

```json
POST /api/companies/{companyId}/issues
{
  "projectId": "{websiteProjectId}",
  "parentId": "{releaseIssueId}",
  "goalId": "{goalId-or-null}",
  "billingCode": "{billingCode-or-null}",
  "title": "Publish release notes for v{version}",
  "priority": "medium",
  "status": "todo",
  "description": "Publish /changelog entry for v{version}. Include full markdown from releases/v{version}.md and prominent upgrade guide if breaking changes exist."
}
```

```json
POST /api/companies/{companyId}/issues
{
  "projectId": "{workspaceProjectId}",
  "parentId": "{releaseIssueId}",
  "goalId": "{goalId-or-null}",
  "billingCode": "{billingCode-or-null}",
  "title": "Draft release announcement tweet for v{version}",
  "priority": "medium",
  "status": "todo",
  "description": "Draft launch tweet with top 1-2 highlights, version number, and changelog URL. If breaking changes exist, include an explicit upgrade-guide callout."
}
```

---

## Step 7 - Wrap Up the Release Issue

Post a concise markdown update linking:
- Release issue
- Changelog file (`releases/v{version}.md`)
- npm package URL (both `@canary` and `@latest` after promotion)
- Canary smoke test result (pass/fail, what was tested)
- Website task
- CMO task
- Final changelog URL (once website publishes)
- Tweet URL (once published)

Completion rules:
- Keep issue `in_progress` until canary is promoted AND website + social tasks
  are done.
- Mark `done` only when all required artifacts are published and linked.
- If waiting on another team, keep open with clear owner and next action.

---

## Release Flow Summary

The full release lifecycle is now:

```
1. Generate changelog      → releases/v{version}.md (review + iterate)
2. Publish canary           → npm @canary dist-tag (latest untouched)
3. Smoke test canary        → Docker clean install verification
4. Promote to latest        → npm @latest dist-tag + git tag + commit
5. Create follow-up tasks   → website changelog + CMO tweet
6. Wrap up                  → link everything, close issue
```

At any point you can re-enter the flow — idempotency guards detect which steps
are already done and skip them. The changelog can be iterated before or after
canary publish. The canary can be re-published if the smoke test reveals issues
(just fix + re-run Step 3). Only after smoke testing passes does `latest` get
updated.

---

## Squadron API Notes (When Running in Agent Context)

Use:
- `GET /api/companies/{companyId}/projects` to resolve website/workspace project IDs.
- `POST /api/companies/{companyId}/issues` to create follow-up tasks.
- `PATCH /api/issues/{issueId}` with comments for release progress.

For issue-modifying calls, include:
- `Authorization: Bearer $SQUADRON_API_KEY`
- `X-Squadron-Run-Id: $SQUADRON_RUN_ID`

---

Follow-up work should reference the stable release, not the canary.

## Failure Handling

If the canary is bad:

- publish another canary, do not ship stable

If stable npm publish succeeds but push or GitHub release creation fails:

- fix the git/GitHub issue immediately from the same checkout
- do not republish the same version

If `latest` is bad after stable publish:

```bash
./scripts/rollback-latest.sh <last-good-version>
```

Then fix forward with a new patch release.

## Output

When the skill completes, provide:

- stable version and, if relevant, the final canary version tested
- verification status
- npm status
- git tag / GitHub Release status
- website / announcement follow-up status
- rollback recommendation if anything is still partially complete
