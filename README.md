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
   - `accentColor`: CSS color used for links and badges
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

If you change `timezone` or `publishTimeLocal`, also update the cron expression
in `.github/workflows/daily-draft.yml`. GitHub cron schedules are UTC.

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
