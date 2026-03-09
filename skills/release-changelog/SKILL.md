---
name: release-changelog
description: >
  Generate user-facing release changelogs for Squadron. Reads git history,
  merged PRs, and changeset files since the last release tag. Detects breaking
  changes, categorizes changes, and outputs structured markdown to
  releases/v{version}.md. Use when preparing a release or when asked to
  generate a changelog.
---

# Release Changelog Skill

Generate a user-facing changelog for a new Squadron release. This skill reads
the commit history, changeset files, and merged PRs since the last release tag,
detects breaking changes, categorizes everything, and writes a structured
release notes file.

Output:

- `releases/v{version}.md`

Important rule:

- even if there are canary releases such as `1.2.3-canary.0`, the changelog file stays `releases/v1.2.3.md`

## Step 0 — Idempotency Check

Before generating anything, check whether the file already exists:

```bash
ls releases/v{version}.md 2>/dev/null
```

If it exists:

1. read it first
2. present it to the reviewer
3. ask whether to keep it, regenerate it, or update specific sections
4. never overwrite it silently

## Step 1 — Determine the Stable Range

Find the last stable tag:

```bash
git tag --list 'v*' --sort=-version:refname | head -1
git log v{last}..HEAD --oneline --no-merges
```

The planned stable version comes from one of:

- an explicit maintainer request
- the chosen bump type applied to the last stable tag
- the release plan already agreed in `doc/RELEASING.md`

Do not derive the changelog version from a canary tag or prerelease suffix.

## Step 2 — Gather the Raw Inputs

Collect release data from:

1. git commits since the last stable tag
2. `.changeset/*.md` files
3. merged PRs via `gh` when available

Useful commands:

```bash
git log v{last}..HEAD --oneline --no-merges
git log v{last}..HEAD --format="%H %s" --no-merges
ls .changeset/*.md | grep -v README.md
gh pr list --state merged --search "merged:>={last-tag-date}" --json number,title,body,labels
```

## Step 3 — Detect Breaking Changes

Look for:

- destructive migrations
- removed or changed API fields/endpoints
- renamed or removed config keys
- `major` changesets
- `BREAKING:` or `BREAKING CHANGE:` commit signals

Key commands:

```bash
git diff --name-only v{last}..HEAD -- packages/db/src/migrations/
git diff v{last}..HEAD -- packages/db/src/schema/
git diff v{last}..HEAD -- server/src/routes/ server/src/api/
git log v{last}..HEAD --format="%s" | rg -n 'BREAKING CHANGE|BREAKING:|^[a-z]+!:' || true
```

If the requested bump is lower than the minimum required bump, flag that before the release proceeds.

## Step 4 — Categorize for Users

Use these stable changelog sections:

- `Breaking Changes`
- `Highlights`
- `Improvements`
- `Fixes`
- `Upgrade Guide` when needed

Exclude purely internal refactors, CI changes, and docs-only work unless they materially affect users.

Guidelines:

- group related commits into one user-facing entry
- write from the user perspective
- keep highlights short and concrete
- spell out upgrade actions for breaking changes

## Step 5 — Write the File

Template:

```markdown
# v{version}

> Released: {YYYY-MM-DD}

## Breaking Changes

## Highlights

## Improvements

## Fixes

## Upgrade Guide

### Before You Update

1. **Back up your database.**
   - SQLite: `cp squadron.db squadron.db.backup`
   - Postgres: `pg_dump -Fc squadron > squadron-pre-{version}.dump`
2. **Note your current version:** `squadronai --version`

### After Updating

{Specific steps: run migrations, update configs, etc.}

### Rolling Back

If something goes wrong:
1. Restore your database backup
2. `npm install @paperclipai/server@{previous-version}`
```

Omit empty sections except `Highlights`, `Improvements`, and `Fixes`, which should usually exist.

## Step 6 — Review Before Release

Before handing it off:

1. confirm the heading is the stable version only
2. confirm there is no `-canary` language in the title or filename
3. confirm any breaking changes have an upgrade path
4. present the draft for human sign-off

This skill never publishes anything. It only prepares the stable changelog artifact.
