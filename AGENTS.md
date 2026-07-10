# Personal News Page Template - agent guide

This repository is a static GitHub Pages starter for a personal daily news
brief. Keep the site dependency-free unless a change clearly requires otherwise.

## Publishing Rule

Daily drafts should go through pull requests. Do not auto-publish generated
news content directly to `main`.

The normal flow is:

1. Generate a draft with `node scripts/new-digest.mjs`.
2. Fill in the brief using `templates/digest-template.html` as the structure.
3. Run `node scripts/build-manifest.mjs`.
4. Run `node --test` and `node scripts/check-digest.mjs <file>`.
5. Open or update a draft PR.
6. Merge only after human review.

AI-generated drafts (enabled by the `ANTHROPIC_API_KEY` Actions secret) go
through this same PR review gate -- a human verifies the cited sources and
merges before anything publishes.

## Content Bar

- Every substantive claim needs a source link in `Detail & sources`.
- Lead with why the story matters for the configured audience.
- Keep the skim surface tight: five glance bullets max, concise story cards.
- Preserve the date format in `<title>`: `D Month YYYY`.
- Keep digest files self-contained with inline CSS and no required external assets.

## Repo Map

- `site.config.json` - public customization surface.
- `index.html` - front page; frames the latest digest.
- `archive.html` - browsable archive.
- `digests.json` - generated manifest.
- `scripts/build-manifest.mjs` - regenerates the manifest.
- `scripts/new-digest.mjs` - creates dated digest drafts.
- `templates/digest-template.html` - editable digest starter.
- `.github/workflows/daily-draft.yml` - scheduled draft PR routine.
- `.github/workflows/build.yml` - GitHub Pages deployment.
