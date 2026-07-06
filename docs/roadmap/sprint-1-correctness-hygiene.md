# Sprint 1 — Correctness & Hygiene Fixes

**Size:** Small (½ day)
**Suggested model:** Claude Haiku 4.5 (`claude-haiku-4-5`)
**Rationale for model:** Every item is a small, mechanical, well-specified edit
with a clear acceptance criterion. No architectural judgment is needed, so the
fastest and cheapest model is the right tool.

## Goal

Remove the small correctness papercuts found in review so later sprints (CI,
feeds, AI generation) build on deterministic, validated foundations.

## Spec

### 1.1 Deterministic `digests.json`

- Remove the `generated: new Date().toISOString()` field from the manifest
  output in `scripts/build-manifest.mjs` (currently line ~130), or replace it
  with the date of the newest digest (already deterministic).
- Rationale: the timestamp makes every run produce a different file, which
  (a) adds diff noise to every daily-draft commit, and (b) blocks the sprint-2
  CI check "regenerate the manifest and fail if it differs from the committed
  one".
- Keep `count` and `digests` unchanged. Regenerate the committed
  `digests.json` once as part of this change.

### 1.2 Stable ordering and duplicate-date warning

- In `build-manifest.mjs`, add `path` as a secondary sort key so equal-date
  digests order deterministically.
- Emit a `console.warn` when two digests resolve to the same date, since
  `index.html` can only frame one of them per `?date=` value.

### 1.3 Numeric HTML entities

- Extend `decodeEntities` in `build-manifest.mjs` to handle decimal
  (`&#8212;`) and hex (`&#x2014;`) numeric entities via
  `String.fromCodePoint`, before the existing named-entity replacements.
  Guard against invalid code points (return the original match).

### 1.4 Validate `?date=` in `index.html`

- Ignore the `date` query parameter unless it matches `/^\d{4}-\d{2}-\d{2}$/`.
  (Behavior today already falls back to the latest digest; this just makes the
  intent explicit and avoids matching against garbage.)

### 1.5 Validate `accentColor`

- In `scripts/config.mjs` `validateSiteConfig`, reject `accentColor` values
  that are not a hex color (`#rgb`, `#rrggbb`, `#rrggbbaa`) or a simple CSS
  color keyword/function (letters, digits, `()`, `,`, `.`, `%`, spaces, `-`).
  The goal is catching typos, not full CSS parsing — keep the pattern loose
  but reject `;`, `}`, `{`, and `<` outright.
- Note: values are already HTML-escaped when injected into digest templates,
  so this is a lint for silent breakage, not a security fix.

### 1.6 Publish only site files to GitHub Pages

- In `.github/workflows/build.yml`, stage a `_site/` directory before
  `upload-pages-artifact` containing only: `index.html`, `archive.html`,
  `digests.json`, `site.config.json`, `.nojekyll`, and every top-level `YYYY/`
  digest directory. Point `upload-pages-artifact` at `_site`.
- Rationale: today the whole repo (including `.github/`, `scripts/`,
  `templates/`, `CLAUDE.md`) is published to the public site.

### 1.7 Validate the `workflow_dispatch` date input early

- In `.github/workflows/daily-draft.yml`, after resolving `DIGEST_DATE`, fail
  fast with a clear `::error::` message when the requested date doesn't match
  `YYYY-MM-DD` (the Node script would throw anyway, but with a stack trace
  instead of a readable message).

## Plan

1. Edit `build-manifest.mjs` (items 1.1–1.3), run `node scripts/build-manifest.mjs`,
   commit the regenerated `digests.json`.
2. Edit `index.html` (1.4) and `scripts/config.mjs` (1.5); run
   `node scripts/validate-config.mjs` to confirm the shipped config passes.
3. Edit both workflow files (1.6, 1.7).
4. Manual verification: create a throwaway digest with `node scripts/new-digest.mjs
   --date 2026-07-06`, rebuild the manifest twice, and confirm the two outputs
   are byte-identical; serve the repo locally (`python3 -m http.server`) and
   check `index.html` with valid/invalid `?date=` values.

## Acceptance criteria

- Running `build-manifest.mjs` twice in a row produces identical bytes.
- A digest whose title uses `&#8212;` renders the em-dash in `digests.json`.
- `validate-config.mjs` fails on `"accentColor": "blu;e}"` and passes on
  `"#2563eb"`, `"rebeccapurple"`, and `"rgb(37, 99, 235)"`.
- The Pages artifact contains no `scripts/`, `templates/`, `.github/`, or
  `CLAUDE.md`.
