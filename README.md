# Personal News Page Template

A small static GitHub Pages site for publishing a personal daily news brief.
Fork it, edit one config file, and use GitHub Actions to create reviewable daily
draft pull requests.

The site itself has no build dependencies. It is plain HTML plus two small Node
scripts that run on GitHub's hosted runners.

## What You Get

| File | Purpose |
| --- | --- |
| `site.config.json` | Your site title, topic, audience, timezone, cadence, color, and draft branch prefix. |
| `index.html` | Homepage that frames the newest published digest. Supports `?date=YYYY-MM-DD`. |
| `archive.html` | Archive grouped by month, newest first. |
| `templates/digest-template.html` | Starter HTML used by the draft generator. |
| `scripts/new-digest.mjs` | Creates a dated draft digest from the template. |
| `scripts/build-manifest.mjs` | Scans dated digest files and writes `digests.json`. |
| `scripts/build-feed.mjs` | Generates `feed.xml` (Atom) and `sitemap.xml` from `digests.json`; skipped until `siteUrl` is set. |
| `.github/workflows/daily-draft.yml` | Scheduled Action that opens draft PRs for review. |
| `.github/workflows/build.yml` | Deploys the published site to GitHub Pages on pushes to `main`. |

## Setup

1. Create a new repository from this template.
2. Edit `site.config.json`:
   - `siteTitle`: name shown in the header and browser title
   - `digestTitlePrefix`: prefix used in each digest `<title>`
   - `topic`: what the daily brief tracks
   - `audience`: who the brief is written for
   - `timezone` and `publishTimeLocal`: when your routine should run
   - `accentColor`: CSS color used for links and badges. The site supports
     light and dark mode (via `prefers-color-scheme`); if you pick a custom
     accent color, check it against both the light background and the dark
     background (see the `@media (prefers-color-scheme: dark)` block in
     `index.html`) for readable contrast before publishing.
   - `siteUrl` (optional): your GitHub Pages URL, e.g.
     `https://user.github.io/repo` (no trailing slash needed). Set this to
     enable the generated Atom feed (`feed.xml`) and sitemap
     (`sitemap.xml`); while it is empty, the build skips both with a notice.
3. Enable GitHub Pages:
   - Settings -> Pages -> Build and deployment -> Source: GitHub Actions
4. Enable GitHub Actions if your fork asks for approval.
5. Run the "Create daily draft" workflow manually once, or wait for the schedule.

The deploy workflow validates the site on every push. If Pages is not enabled
yet, it exits successfully with a notice and skips deployment.

## Daily Routine

The scheduled workflow does not publish automatically. It creates a branch like
`daily-digest/2026-07-04`, writes a draft digest file, rebuilds `digests.json`,
and opens a draft pull request.

Review the PR, replace the placeholder text with your brief, add source links,
and merge it into `main`. The Pages workflow then publishes the digest.

GitHub cron schedules run in UTC, but `timezone`/`publishTimeLocal` is a local
wall-clock time whose UTC offset changes with daylight saving time. Instead of
requiring a manual cron edit whenever you change either setting,
`.github/workflows/daily-draft.yml` fires twice a day -- once for each
possible UTC offset of the configured local time -- and a guard step
(`scripts/should-run-now.mjs`) checks the current wall-clock time in
`config.timezone` against `publishTimeLocal` (±35 minutes) to decide which of
the two firings actually creates a draft; the other one no-ops.
`workflow_dispatch` runs always pass `--force` to bypass the time gate.

If you change `timezone` or `publishTimeLocal` far enough that the two cron
lines no longer bracket it, `node scripts/check-cron.mjs` (run automatically
in PR CI) fails and prints the exact cron lines to paste into
`.github/workflows/daily-draft.yml`.

## Local Commands

Validate your config:

```bash
node scripts/validate-config.mjs
```

Create a draft for today:

```bash
node scripts/new-digest.mjs
```

Create a draft for a specific date:

```bash
node scripts/new-digest.mjs --date 2026-07-04
```

Preview where a draft would be written:

```bash
node scripts/new-digest.mjs --date 2026-07-04 --dry-run
```

Rebuild the manifest:

```bash
node scripts/build-manifest.mjs
```

Generate the Atom feed and sitemap (requires `siteUrl` to be set in
`site.config.json`; otherwise it prints a notice and exits without writing
anything):

```bash
node scripts/build-feed.mjs
```

Run the unit tests:

```bash
node --test
```

Lint a digest against the Content Bar (bullet count, source links, self-contained assets, etc.):

```bash
node scripts/check-digest.mjs path/to/digest.html
```

## Content Format

Each digest is a self-contained HTML file under:

```text
YEAR/Month/Week range/D Month Personal News Digest.html
```

The manifest reads the date from the digest `<title>` using `D Month YYYY`.
The archive preview comes from `<meta name="description">`. Keep both accurate
before merging a daily PR.

The starter template is designed for a quick skim:

- Up to five "At a glance" bullets.
- A small set of story cards.
- One clear "Why it matters" line per story.
- Source links inside each story's details block.
