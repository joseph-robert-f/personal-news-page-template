# Sprint 2 — Tests & PR Quality Gates

**Size:** Small/medium (1 day)
**Suggested model:** Claude Sonnet 5 (`claude-sonnet-5`)
**Rationale for model:** Writing a useful test suite and a content linter
requires judgment about what to cover and how strict to be; Sonnet 5 is the
sweet spot for multi-file coding work of this shape. Haiku would produce
shallower coverage; Opus is more than the task needs.

## Goal

Catch broken configs, broken digests, and stale manifests **before** they merge
to `main`, and turn the documented "Content Bar" rules into an executable
check. Stay dependency-free by using Node's built-in `node:test` runner.

## Spec

### 2.1 Unit tests (`node --test`)

Create a `test/` directory using only `node:test` + `node:assert` (no new
dependencies — this repo's core constraint). Cover at minimum:

- `scripts/config.mjs`
  - `validateSiteConfig`: each required string missing/empty; bad
    `publishTimeLocal` (`"25:00"`, `"6:30"`); bad `timezone`
    (`"Mars/Olympus"`); bad `draftBranchPrefix` (`"feat branch"`); a fully
    valid config.
  - `parseIsoParts`: rejects `2026-02-30`, `2026-13-01`, `garbage`; accepts
    leap day `2028-02-29`.
  - `formatIsoDate`: `2026-07-06` → `6 July 2026`.
- `scripts/build-manifest.mjs` — export (or extract into a shared module) the
  pure helpers so they can be imported: `parseDate`, `parseDateFromPath`,
  `decodeEntities`, `stripTags`. Test title parsing (`"Personal News Digest —
  15 June 2026"`), path fallback (`"2026/July/29 June - 5 July/2 July X.html"`),
  and entity decoding (named + numeric once sprint 1 lands).
- `scripts/new-digest.mjs` — extract `formatWeekRange`, `sanitizeFilePart`,
  and `renderTemplate` into an importable module. Test the week range across a
  year boundary (e.g. 2026-01-01 → `"29 December 2025 - 4 January 2026"`),
  filename sanitization of `/:*?"<>|`, and that `renderTemplate` throws on an
  unknown placeholder and HTML-escapes values.

Refactor note: prefer moving pure functions into `scripts/lib/` modules that
both the CLIs and tests import, rather than importing CLI entry points (which
execute on import).

### 2.2 Digest content linter (`scripts/check-digest.mjs`)

New zero-dependency script: `node scripts/check-digest.mjs <file> [...files]`.
It enforces the Content Bar from `CLAUDE.md`:

- `<title>` contains a parseable `D Month YYYY` date.
- `<meta name="description">` exists and is non-empty (the archive preview).
- At most **5** items inside `<ol class="bullets">`.
- Every `<article class="story">` contains at least one `https://` link inside
  its `ul.sources` block.
- Self-contained: no `<script src=`, `<link rel="stylesheet"`, or `<img src="http`
  pointing at external hosts.
- Placeholder text from the template (e.g. `"Sharp, specific headline"`,
  `"Lead point."`) is treated as a **warning**, not an error, so freshly
  generated drafts don't fail CI — but pass `--strict` to promote warnings to
  errors (used on PRs whose branch is about to merge, optional).

Exit non-zero on any error; print one line per finding with file and reason.

### 2.3 PR validation workflow (`.github/workflows/pr-checks.yml`)

Runs on `pull_request` targeting `main`:

1. `node scripts/validate-config.mjs`
2. `node --test`
3. `node scripts/build-manifest.mjs && git diff --exit-code digests.json`
   (fails when a PR forgets to rebuild the manifest — requires sprint 1.1's
   deterministic output).
4. Run `scripts/check-digest.mjs` against digest files changed in the PR
   (diff against the merge base; skip when none changed).

Permissions: `contents: read` only.

## Plan

1. Extract pure helpers from `build-manifest.mjs` / `new-digest.mjs` into
   `scripts/lib/` (no behavior change; keep the CLI files as thin wrappers).
2. Write the unit tests; run `node --test` until green.
3. Write `check-digest.mjs`; verify it passes on a freshly generated draft
   (warnings only) and fails on a hand-broken digest (6 bullets, no sources).
4. Add `pr-checks.yml`; open a scratch PR to confirm all four gates run.
5. Update `README.md` ("Local Commands") and `CLAUDE.md` (add
   `node --test` and `check-digest` to the publishing flow).

## Acceptance criteria

- `node --test` passes locally and in CI with no new dependencies.
- A PR that edits a digest without rebuilding `digests.json` fails check 3.
- A digest with six glance bullets or a story without a source link fails the
  linter; the untouched generated draft does not (warnings only).
