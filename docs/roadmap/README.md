# Roadmap: Repo Review & Sprint Plan

This directory contains the output of a full review of the repository, organized
into six sprints. Sprints 1-3 are smaller changes (fixes, tests, polish);
sprints 4-6 are major changes (new features and workflow capabilities).

Each sprint document is a self-contained spec + implementation plan, including a
recommended Anthropic model for executing the work (e.g. via Claude Code).

## Sprint Overview

| Sprint | Size | Theme | Suggested model | Why this model |
| --- | --- | --- | --- | --- |
| [1. Correctness & hygiene fixes](sprint-1-correctness-hygiene.md) | Small | Deterministic manifest, entity decoding, input validation, leaner Pages artifact | **Claude Haiku 4.5** (`claude-haiku-4-5`, $1/$5 per MTok) | Well-scoped mechanical edits with explicit acceptance criteria; the cheapest/fastest model is sufficient. |
| [2. Tests & PR quality gates](sprint-2-tests-and-ci.md) | Small/medium | `node:test` unit tests, digest content linter, PR validation workflow | **Claude Sonnet 5** (`claude-sonnet-5`, $3/$15 per MTok, intro $2/$10 through 2026-08-31) | Multi-file work requiring judgment about test coverage and CI design; strong coding model at moderate cost. |
| [3. UI polish & front-end consolidation](sprint-3-ui-polish.md) | Small/medium | Dark mode, accessibility, 404 page, de-duplicating the front-end config | **Claude Sonnet 5** | Design-sensitive CSS/JS work across three coordinated pages. |
| [4. Feeds & discoverability](sprint-4-feeds-discoverability.md) | Major | Atom feed, sitemap, Open Graph metadata, `siteUrl` config key | **Claude Sonnet 5** | New generator script plus config-surface change; standard web-standards work. |
| [5. DST-safe scheduling](sprint-5-dst-safe-scheduling.md) | Major | Remove the manual cron/timezone sync; guard-step pattern | **Claude Sonnet 5** | Small amount of code but subtle timezone logic that must be tested carefully. |
| [6. AI-assisted draft generation](sprint-6-ai-draft-generation.md) | Major | Optionally pre-fill the daily draft with sourced content via the Claude API | **Claude Opus 4.8** (`claude-opus-4-8`, $5/$25 per MTok) to implement; **Claude Sonnet 5** as the runtime model inside the workflow | Implementation involves agentic-workflow and prompt design where the strongest coding model pays off; at runtime, Sonnet 5 with web search balances quality and daily cost. |

## Recommended Order

Sprints 1 → 2 should land first: sprint 2's CI gates protect every later sprint.
Sprints 3, 4, and 5 are independent of each other and can be done in any order
(or in parallel). Sprint 6 depends on sprint 2 (the digest linter validates
generated content) and benefits from sprint 5 (reliable scheduling).

## Review Summary (what motivated these sprints)

Overall the codebase is in good shape: zero-dependency, well-commented scripts,
defensive parsing with sensible fallbacks, and workflows that fail gracefully.
The findings below are improvements, not rescues.

**Correctness / robustness (sprint 1)**
- `scripts/build-manifest.mjs` writes a `generated` timestamp into
  `digests.json` on every run, making the output non-deterministic. The daily
  draft workflow commits this file, so every draft commit carries diff noise,
  and CI can't verify "manifest is up to date" by diffing.
- Two digests with the same date have no tie-break in the manifest sort, and
  `index.html` silently picks whichever lands first.
- `decodeEntities` handles a fixed list of named entities but no numeric
  entities (`&#8212;`, `&#x2014;`), which appear easily in copied headlines.
- `index.html` accepts any `?date=` string without format validation.
- `accentColor` accepts any string; a typo silently breaks styling site-wide.
- `.github/workflows/build.yml` uploads the entire repository as the Pages
  artifact, publishing `scripts/`, `templates/`, `CLAUDE.md`, and `.github/`.

**Quality gates (sprint 2)**
- There are no tests, and no CI runs on pull requests — a digest with a broken
  `<title>` date or a bad `site.config.json` is only caught after merging to
  `main`, when the deploy workflow runs. The repo's own "Content Bar" rules
  (five glance bullets max, source links required, date format) are documented
  but not enforced anywhere.

**Front-end (sprint 3)**
- `DEFAULT_CONFIG` is copy-pasted in three places (`scripts/config.mjs`,
  `index.html`, `archive.html`) and will drift.
- Light-mode only; no `prefers-color-scheme` support.
- No `404.html` (GitHub Pages serves a generic error page).

**Missing features (sprints 4-6)**
- No feed (Atom/RSS), sitemap, or Open Graph tags — significant for a
  news-digest site.
- The cron schedule and `timezone`/`publishTimeLocal` config must be kept in
  sync by hand, and DST shifts the actual run time twice a year.
- The generated draft is pure placeholder text; the biggest leverage feature is
  optionally pre-filling it with real, sourced content via the Claude API while
  keeping the existing human-review PR gate.
